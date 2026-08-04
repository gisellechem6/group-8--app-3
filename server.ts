import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import * as XLSX from 'xlsx';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Initialize Google GenAI client server-side
const getAIClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('GEMINI_API_KEY is not set in environment.');
    return null;
  }
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// System instruction prompt rules strictly adhering to user instructions
const SYSTEM_INSTRUCTION_BASE = `You are an AI assistant inside a payment monitoring app called Payment Monitor.

Your tasks are:
* Check invoice information.
* Identify missing details.
* Draft payment reminders.
* Summarise upcoming and overdue invoices.

Strict Negative Constraints (DO NOT DO THE FOLLOWING):
* Do not approve invoices.
* Do not make payments.
* Do not change amounts, dates or bank details.
* Do not guess missing information.
* Use only verified invoice data.
* If information is missing, say "Needs Review".
* Keep reminders clear, polite and short.
* Never say an invoice is paid unless the system confirms it.
`;

// API Route: Inspect Invoice
app.post('/api/ai/inspect-invoice', async (req, res) => {
  try {
    const invoice = req.body;
    const ai = getAIClient();

    if (!ai) {
      return res.status(500).json({
        error: 'Gemini API Key missing on server.',
      });
    }

    const prompt = `Analyze the following invoice details for completeness and missing information. Do NOT guess any missing fields.

Invoice Data:
Supplier Name: ${invoice.supplierName || 'MISSING'}
Invoice Number: ${invoice.invoiceNumber || 'MISSING'}
Invoice Date: ${invoice.invoiceDate || 'MISSING'}
Approval Date: ${invoice.approvalDate || 'MISSING'}
Amount (SGD): ${invoice.amount ? `SGD ${invoice.amount}` : 'MISSING'}
Payment Terms: ${invoice.paymentTerms || 'MISSING'}
Fixed Due Date: ${invoice.fixedDueDate || 'N/A'}
Bank Details: ${invoice.bankDetails || 'MISSING'}

Identify any missing fields. If information is missing, state "Needs Review" and list what is missing. Provide a short 2-sentence summary of the inspection result.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_BASE,
      },
    });

    const text = response.text || 'Needs Review: Verification incomplete.';
    res.json({ result: text });
  } catch (err: any) {
    console.error('Error in inspect-invoice:', err);
    res.status(500).json({ error: err.message || 'Failed to inspect invoice.' });
  }
});

// API Route: Draft Payment Reminder
app.post('/api/ai/draft-reminder', async (req, res) => {
  try {
    const { invoice, stageLabel, formattedDueDate, formattedAmount } = req.body;
    const ai = getAIClient();

    if (!ai) {
      return res.status(500).json({ error: 'Gemini API Key missing on server.' });
    }

    const isMissingInfo =
      !invoice ||
      !invoice.supplierName ||
      !invoice.invoiceNumber ||
      invoice.amount === undefined ||
      invoice.amount === null ||
      !invoice.calculatedDueDate ||
      !invoice.status;

    if (isMissingInfo) {
      return res.json({
        subject: 'Needs Review',
        body: 'Needs Review',
      });
    }

    const prompt = `Create a short payment reminder using the details below.
Supplier: ${invoice.supplierName}
Invoice number: ${invoice.invoiceNumber}
Amount: ${formattedAmount || `SGD ${invoice.amount}`}
Due date: ${formattedDueDate}
Payment status: ${invoice.status}

Include:
* The invoice number
* The amount
* The payment deadline
* The action staff should take

Keep the message professional and under 100 words.
Do not invent missing information. If important information is missing, return “Needs Review”.

Output JSON format with two keys: "subject" and "body".
The "subject" should be professional (e.g. "Payment Reminder: Invoice ${invoice.invoiceNumber} - ${invoice.supplierName}").
The "body" must be under 100 words, professional, and explicitly state the action staff should take (e.g. verify invoice matching and approve remittance before the due date).`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_BASE + ' Always format output as valid JSON with "subject" and "body" properties. Never invent missing information.',
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '{}';
    let parsed = { subject: '', body: '' };
    try {
      parsed = JSON.parse(text);
      if (parsed.body && parsed.body.includes('Needs Review')) {
        return res.json({ subject: 'Needs Review', body: 'Needs Review' });
      }
    } catch (e) {
      parsed = {
        subject: `Payment Reminder: Invoice ${invoice.invoiceNumber} - ${invoice.supplierName}`,
        body: `Supplier: ${invoice.supplierName}\nInvoice number: ${invoice.invoiceNumber}\nAmount: ${formattedAmount}\nDue date: ${formattedDueDate}\nPayment status: ${invoice.status}\n\nAction required: Finance staff should verify 3-way matching and approve remittance before the due date.\n\nBest regards,\nFinance Department`,
      };
    }

    res.json(parsed);
  } catch (err: any) {
    console.error('Error drafting reminder:', err);
    res.status(500).json({ error: err.message || 'Failed to draft reminder.' });
  }
});

// API Route: Portfolio Summary
app.post('/api/ai/summarize-portfolio', async (req, res) => {
  try {
    const { unpaidInvoices, overdueCount, dueTodayCount, due7DaysCount, needsReviewCount } = req.body;
    const ai = getAIClient();

    if (!ai) {
      return res.status(500).json({ error: 'Gemini API Key missing on server.' });
    }

    const prompt = `Provide a concise executive financial summary of upcoming and overdue supplier invoices for the finance team.

Current Metrics:
- Overdue Invoices: ${overdueCount}
- Due Today: ${dueTodayCount}
- Due Within 7 Days: ${due7DaysCount}
- Invoices Needing Review: ${needsReviewCount}

Verified Invoice List:
${JSON.stringify(unpaidInvoices, null, 2)}

Provide:
1. A concise overview (3 bullet points max).
2. Actionable recommendations for staff review (do NOT suggest automated payments or approvals).`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_BASE,
      },
    });

    res.json({ summary: response.text });
  } catch (err: any) {
    console.error('Error summarizing portfolio:', err);
    res.status(500).json({ error: err.message || 'Failed to summarize portfolio.' });
  }
});

// Helper to convert uploaded file payload into Gemini content
function processFilePayload(f: any, idx: number): any {
  if (f.textContent) {
    return `Document ${idx + 1} (${f.fileName || 'Text/Spreadsheet File'}):\n${f.textContent}`;
  }

  if (f.fileData) {
    const isSpreadsheet = 
      (f.fileType && (f.fileType.includes('sheet') || f.fileType.includes('excel') || f.fileType.includes('csv'))) ||
      (f.fileName && (f.fileName.endsWith('.xlsx') || f.fileName.endsWith('.xls') || f.fileName.endsWith('.csv') || f.fileName.endsWith('.ods')));

    if (isSpreadsheet) {
      try {
        const buffer = Buffer.from(f.fileData, 'base64');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        let csvText = '';
        workbook.SheetNames.forEach((sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          csvText += `--- Sheet: ${sheetName} ---\n` + XLSX.utils.sheet_to_csv(sheet) + '\n\n';
        });
        return `Document ${idx + 1} (${f.fileName || 'Spreadsheet'}):\n${csvText}`;
      } catch (err) {
        console.warn('Failed to parse spreadsheet buffer with XLSX, fallback to raw text or inline:', err);
      }
    }

    // Supported multimodal formats for Gemini (images, PDF)
    if (f.fileType && (f.fileType.startsWith('image/') || f.fileType === 'application/pdf')) {
      return {
        inlineData: {
          mimeType: f.fileType,
          data: f.fileData,
        },
      };
    }
  }

  return `Document ${idx + 1} (${f.fileName || 'Document'}): [Attached non-standard binary document context]`;
}

// API Route: Extract Document / Excel / PDF / Image Data (Single or Multiple Batch Files)
app.post('/api/ai/extract-document', async (req, res) => {
  try {
    const { files, fileData, fileType, textContent } = req.body;
    const ai = getAIClient();

    if (!ai) {
      return res.status(500).json({ error: 'Gemini API Key missing on server.' });
    }

    const prompt = `Extract all invoice details from the provided files/documents/spreadsheets/text content.
Note that the input may contain MULTIPLE documents, PDFs, images, or spreadsheets containing one or more invoices.
Extract EVERY invoice found across all provided sources.

Do NOT guess or make up data if a field is absent in the source material.
For missing fields, return empty string "" or null.

For each invoice found, extract the following structured properties:
- supplierName (string or null)
- invoiceNumber (string or null)
- invoiceDate (string YYYY-MM-DD or null)
- approvalDate (string YYYY-MM-DD or null)
- amount (number or null)
- paymentTerms (string: 'Due on receipt', 'Net 7', 'Net 14', 'Net 30', 'Net 45', 'Net 60', or 'Fixed due date')
- fixedDueDate (string YYYY-MM-DD or null)
- bankDetails (string or null)
- poNumber (string or null)
- poAmount (number or null)
- grnNumber (string or null)
- grnVerified (boolean, default true if GRN present)
- contactEmail (string or null)
- notes (string or null)

Return a JSON object with a key "invoices" containing an array of invoice objects.`;

    let contents: any[] = [];

    if (Array.isArray(files) && files.length > 0) {
      files.forEach((f: any, idx: number) => {
        contents.push(processFilePayload(f, idx));
      });
      contents.push(prompt);
    } else if (fileData && fileType) {
      contents = [
        processFilePayload({ fileData, fileType, fileName: 'Uploaded File' }, 0),
        prompt,
      ];
    } else {
      contents = [`Source Document Content:\n${textContent || ''}\n\n${prompt}`];
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_BASE + ' Extract strictly verified data from documents and spreadsheets. Never guess missing values. Handle batch multi-file extractions seamlessly. Output valid JSON.',
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '{"invoices": []}';
    let parsed = { invoices: [] };
    try {
      parsed = JSON.parse(text);
      if (!Array.isArray((parsed as any).invoices)) {
        if ((parsed as any).supplierName || (parsed as any).invoiceNumber) {
          parsed = { invoices: [(parsed as any)] };
        } else {
          parsed = { invoices: [] };
        }
      }
    } catch (e) {
      parsed = { invoices: [] };
    }

    res.json(parsed);
  } catch (err: any) {
    console.error('Error extracting document:', err);
    res.status(500).json({ error: err.message || 'Failed to extract document content.' });
  }
});

// Start Express + Vite Middleware setup
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Payment Monitor] Server running on http://localhost:${PORT}`);
  });
}

startServer();
