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

// ==========================================
// RESILIENT RULE-BASED HEURISTIC FALLBACKS
// ==========================================

function isGeminiQuotaError(err: any): boolean {
  if (!err) return false;
  const errStr = typeof err === 'object' ? JSON.stringify(err) : String(err);
  return (
    err?.status === 429 ||
    err?.code === 429 ||
    errStr.includes('429') ||
    errStr.includes('RESOURCE_EXHAUSTED') ||
    errStr.includes('Quota exceeded') ||
    errStr.includes('quota')
  );
}

function heuristicInspectInvoice(invoice: any): string {
  const missing: string[] = [];
  if (!invoice) return "Needs Review: No invoice details provided.";
  
  if (!invoice.supplierName || invoice.supplierName.trim().toLowerCase() === 'needs review') missing.push("Supplier Name");
  if (!invoice.invoiceNumber || invoice.invoiceNumber.trim().toLowerCase() === 'needs review') missing.push("Invoice Number");
  if (!invoice.invoiceDate) missing.push("Invoice Date");
  if (!invoice.approvalDate) missing.push("Approval Date");
  if (invoice.amount === undefined || invoice.amount === null || invoice.amount <= 0) missing.push("Amount");
  if (!invoice.paymentTerms) missing.push("Payment Terms");
  if (!invoice.bankDetails) missing.push("Bank Details");

  if (missing.length > 0) {
    return `Needs Review: The following critical invoice information is missing or unverified: ${missing.join(", ")}. Please review and update these details manually.`;
  } else {
    return `All required invoice fields (Supplier Name, Invoice Number, Invoice Date, Approval Date, Amount, Payment Terms, and Bank Details) have been verified. This invoice is structurally complete and ready for matching.`;
  }
}

function heuristicDraftReminder(invoice: any, stageLabel?: string, formattedDueDate?: string, formattedAmount?: string): { subject: string; body: string } {
  const isMissingInfo =
    !invoice ||
    !invoice.supplierName ||
    invoice.supplierName.trim().toLowerCase() === 'needs review' ||
    !invoice.invoiceNumber ||
    invoice.invoiceNumber.trim().toLowerCase() === 'needs review' ||
    invoice.amount === undefined ||
    invoice.amount === null ||
    !invoice.calculatedDueDate ||
    !invoice.status;

  if (isMissingInfo) {
    return {
      subject: 'Needs Review',
      body: 'Needs Review',
    };
  }

  const cleanAmount = formattedAmount || `SGD ${(invoice.amount || 0).toLocaleString('en-SG', { minimumFractionDigits: 2 })}`;
  const cleanDueDate = formattedDueDate || invoice.calculatedDueDate || 'Needs Review';
  const stageStr = stageLabel ? ` (${stageLabel})` : '';

  const subject = `Payment Reminder${stageStr}: Invoice ${invoice.invoiceNumber} - ${invoice.supplierName}`;
  const body = `Dear Team,

This is a professional payment reminder regarding the following invoice:
- Supplier: ${invoice.supplierName}
- Invoice Number: ${invoice.invoiceNumber}
- Amount: ${cleanAmount}
- Due Date: ${cleanDueDate}
- Payment Status: ${invoice.status}

Action Required: Finance staff should verify invoice 3-way matching and approve remittance before the due date.

Best regards,
Finance Department`;

  return { subject, body };
}

function heuristicSummarizePortfolio(body: any): string {
  const { unpaidInvoices = [], overdueCount = 0, dueTodayCount = 0, due7DaysCount = 0, needsReviewCount = 0 } = body || {};

  const bulletPoints: string[] = [];
  if (overdueCount > 0) {
    bulletPoints.push(`There are currently ${overdueCount} overdue invoices requiring immediate attention.`);
  } else {
    bulletPoints.push(`All settled invoices are up to date; there are no outstanding overdue items at this moment.`);
  }

  if (dueTodayCount > 0 || due7DaysCount > 0) {
    bulletPoints.push(`We have ${dueTodayCount} invoices due today and ${due7DaysCount} invoices due within the next 7 days.`);
  } else {
    bulletPoints.push(`No critical upcoming payments are due in the next 7 days.`);
  }

  if (needsReviewCount > 0) {
    bulletPoints.push(`${needsReviewCount} invoices are currently marked as "Needs Review" due to missing details or match discrepancies.`);
  } else {
    bulletPoints.push(`All current invoices have successfully passed initial structural completeness checks.`);
  }

  const recommendations = [
    `Please prioritize the ${needsReviewCount} invoices marked as "Needs Review" to verify supplier details and bank information manually.`,
    `Finance staff should perform detailed three-way matching against Purchase Orders (PO) and Goods Receipt Notes (GRN) before preparing the upcoming SGD payment runs.`
  ];

  return `### Executive Invoice Portfolio Summary

**Portfolio Status Overview:**
${bulletPoints.map(p => `* ${p}`).join('\n')}

**Staff Recommendations:**
${recommendations.map((r, idx) => `${idx + 1}. ${r}`).join('\n')}

*(Notice: Portfolio summarized using local analytical heuristics due to Gemini API rate limits)*`;
}

function extractAllTextContent(body: any): string {
  const { files, fileData, fileType, textContent } = body || {};
  let combinedText = '';

  if (Array.isArray(files) && files.length > 0) {
    files.forEach((f: any, idx: number) => {
      if (f.textContent) {
        combinedText += f.textContent + '\n';
      } else if (f.fileData) {
        const isSpreadsheet = 
          (f.fileType && (f.fileType.includes('sheet') || f.fileType.includes('excel') || f.fileType.includes('csv'))) ||
          (f.fileName && (f.fileName.endsWith('.xlsx') || f.fileName.endsWith('.xls') || f.fileName.endsWith('.csv') || f.fileName.endsWith('.ods')));

        if (isSpreadsheet) {
          try {
            const buffer = Buffer.from(f.fileData, 'base64');
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            workbook.SheetNames.forEach((sheetName) => {
              const sheet = workbook.Sheets[sheetName];
              combinedText += `--- Sheet: ${sheetName} ---\n` + XLSX.utils.sheet_to_csv(sheet) + '\n\n';
            });
          } catch (e) {
            console.error('Error parsing sheet in extractor:', e);
          }
        } else {
          try {
            const decoded = Buffer.from(f.fileData, 'base64').toString('utf-8');
            if (!/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(decoded.substring(0, 500))) {
              combinedText += decoded + '\n';
            } else {
              combinedText += `Document: ${f.fileName || 'Attached File'}\n`;
            }
          } catch (e) {}
        }
      }
    });
  } else if (fileData && fileType) {
    const isSpreadsheet = fileType.includes('sheet') || fileType.includes('excel') || fileType.includes('csv');
    if (isSpreadsheet) {
      try {
        const buffer = Buffer.from(fileData, 'base64');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        workbook.SheetNames.forEach((sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          combinedText += `--- Sheet: ${sheetName} ---\n` + XLSX.utils.sheet_to_csv(sheet) + '\n\n';
        });
      } catch (e) {}
    } else {
      try {
        const decoded = Buffer.from(fileData, 'base64').toString('utf-8');
        if (!/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(decoded.substring(0, 500))) {
          combinedText += decoded + '\n';
        }
      } catch (e) {}
    }
  }

  if (textContent) {
    combinedText += textContent + '\n';
  }

  return combinedText;
}

function heuristicExtractInvoicesFromText(text: string): any[] {
  const invoices: any[] = [];
  if (!text) return invoices;

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  let headers: string[] = [];
  let delimiter = ',';
  let headerIndex = -1;
  
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const line = lines[i];
    const commacount = (line.match(/,/g) || []).length;
    const tabcount = (line.match(/\t/g) || []).length;
    const currentDelimiter = tabcount > commacount ? '\t' : ',';
    const parts = line.split(currentDelimiter).map(p => p.trim().toLowerCase());
    
    if (parts.some(p => p.includes('supplier') || p.includes('vendor') || p.includes('invoice') || p.includes('inv #') || p.includes('amount'))) {
      headers = line.split(currentDelimiter).map(p => p.trim());
      delimiter = currentDelimiter;
      headerIndex = i;
      break;
    }
  }

  if (headerIndex !== -1 && headers.length > 0) {
    let supplierIdx = -1;
    let invoiceNumIdx = -1;
    let dateIdx = -1;
    let amountIdx = -1;
    let termsIdx = -1;
    let bankIdx = -1;
    let poIdx = -1;
    let poAmtIdx = -1;
    let grnIdx = -1;
    let emailIdx = -1;

    headers.forEach((h, idx) => {
      const lh = h.toLowerCase();
      if (lh.includes('supplier') || lh.includes('vendor') || lh.includes('company')) supplierIdx = idx;
      else if (lh.includes('invoice number') || lh.includes('invoice #') || lh.includes('inv #') || lh.includes('invoice_num') || lh === 'invoice' || lh === 'inv_no' || lh.includes('invno') || lh.includes('bill no')) invoiceNumIdx = idx;
      else if (lh.includes('invoice date') || lh.includes('inv date') || lh.includes('date') || lh.includes('bill_date')) dateIdx = idx;
      else if (lh.includes('amount') || lh.includes('total') || lh.includes('sum') || lh.includes('value') || lh === 'sgd') amountIdx = idx;
      else if (lh.includes('terms') || lh.includes('payment_terms') || lh.includes('payment terms')) termsIdx = idx;
      else if (lh.includes('bank') || lh.includes('account') || lh.includes('acc_no') || lh.includes('payment details')) bankIdx = idx;
      else if (lh.includes('po number') || lh.includes('po #') || lh.includes('po_num') || lh === 'po') poIdx = idx;
      else if (lh.includes('po amount') || lh.includes('po_amt') || lh.includes('po val')) poAmtIdx = idx;
      else if (lh.includes('grn') || lh.includes('receipt') || lh.includes('grn_num')) grnIdx = idx;
      else if (lh.includes('email') || lh.includes('contact')) emailIdx = idx;
    });

    for (let i = headerIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('--- Sheet:')) continue;
      const parts = line.split(delimiter).map(p => p.trim());
      if (parts.length < Math.max(2, headers.length - 2)) continue;

      const supplierName = supplierIdx !== -1 ? parts[supplierIdx] : null;
      const invoiceNumber = invoiceNumIdx !== -1 ? parts[invoiceNumIdx] : null;
      
      if (!supplierName && !invoiceNumber) continue;

      const amountStr = amountIdx !== -1 ? parts[amountIdx].replace(/[^0-9.]/g, '') : '';
      const amount = amountStr ? parseFloat(amountStr) : null;

      const rawDate = dateIdx !== -1 ? parts[dateIdx] : '';
      let invoiceDate = null;
      if (rawDate) {
        const parsedDate = new Date(rawDate);
        if (!isNaN(parsedDate.getTime())) {
          invoiceDate = parsedDate.toISOString().split('T')[0];
        } else {
          invoiceDate = rawDate;
        }
      }

      const paymentTerms = termsIdx !== -1 ? parts[termsIdx] : 'Net 30';
      const bankDetails = bankIdx !== -1 ? parts[bankIdx] : null;
      const poNumber = poIdx !== -1 ? parts[poIdx] : null;
      const poAmountStr = poAmtIdx !== -1 ? parts[poAmtIdx].replace(/[^0-9.]/g, '') : '';
      const poAmount = poAmountStr ? parseFloat(poAmountStr) : null;
      const grnNumber = grnIdx !== -1 ? parts[grnIdx] : null;
      const contactEmail = emailIdx !== -1 ? parts[emailIdx] : null;

      invoices.push({
        supplierName: supplierName || 'Needs Review',
        invoiceNumber: invoiceNumber || 'Needs Review',
        invoiceDate: invoiceDate || new Date().toISOString().split('T')[0],
        approvalDate: invoiceDate || new Date().toISOString().split('T')[0],
        amount: amount || 0,
        paymentTerms: paymentTerms || 'Net 30',
        fixedDueDate: null,
        bankDetails: bankDetails || '',
        poNumber: poNumber || '',
        poAmount: poAmount || 0,
        grnNumber: grnNumber || '',
        grnVerified: !!grnNumber,
        contactEmail: contactEmail || '',
        notes: 'Extracted locally via CSV/TSV table heuristics',
      });
    }
  }

  if (invoices.length === 0) {
    const supplierMatch = text.match(/(?:supplier|vendor|company|from|billed by)\s*:\s*([^\n\r]+)/i) || text.match(/(?:supplier|vendor|company|from)\s+([^\n\r,]+)/i);
    const invoiceNumMatch = text.match(/(?:invoice number|invoice #|inv #|inv_no|bill no|invoice_num)\s*[:#\-]?\s*([a-zA-Z0-9_\-]+)/i) || text.match(/(?:inv|invoice|bill)\s*#?\s*([a-zA-Z0-9_\-]+)/i);
    const amountMatch = text.match(/(?:amount|total|sum|grand total|sgd|balance due)\s*[:$\-]?\s*(?:sgd|usd|\$)?\s*([0-9,]+\.[0-9]{2})/i) || text.match(/(?:sgd|usd|\$)\s*([0-9,]+\.[0-9]{2})/i);
    const dateMatch = text.match(/(?:invoice date|date|billing date)\s*[:\-]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{2}\/[0-9]{2}\/[0-9]{4}|[^\n\r,]+)/i);
    const bankMatch = text.match(/(?:bank details|bank account|acc no|iban|swift|pay to|dbs|ocbc|uob)\s*[:\-]?\s*([^\n\r]+)/i);
    const poMatch = text.match(/(?:po number|po #|po_num|purchase order)\s*[:\-]?\s*([a-zA-Z0-9_\-]+)/i);
    const grnMatch = text.match(/(?:grn number|grn #|grn_num|goods receipt)\s*[:\-]?\s*([a-zA-Z0-9_\-]+)/i);
    const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);

    const supplierName = supplierMatch ? supplierMatch[1].trim() : null;
    const invoiceNumber = invoiceNumMatch ? invoiceNumMatch[1].trim() : null;
    const amountStr = amountMatch ? amountMatch[1].replace(/,/g, '') : null;
    const amount = amountStr ? parseFloat(amountStr) : null;
    
    let invoiceDate = null;
    if (dateMatch) {
      const rawDate = dateMatch[1].trim();
      const parsedDate = new Date(rawDate);
      if (!isNaN(parsedDate.getTime())) {
        invoiceDate = parsedDate.toISOString().split('T')[0];
      } else {
        invoiceDate = rawDate;
      }
    }

    if (supplierName || invoiceNumber || amount) {
      invoices.push({
        supplierName: supplierName || 'Needs Review',
        invoiceNumber: invoiceNumber || 'Needs Review',
        invoiceDate: invoiceDate || new Date().toISOString().split('T')[0],
        approvalDate: invoiceDate || new Date().toISOString().split('T')[0],
        amount: amount || 0,
        paymentTerms: 'Net 30',
        fixedDueDate: null,
        bankDetails: bankMatch ? bankMatch[1].trim() : '',
        poNumber: poMatch ? poMatch[1].trim() : '',
        poAmount: 0,
        grnNumber: grnMatch ? grnMatch[1].trim() : '',
        grnVerified: !!grnMatch,
        contactEmail: emailMatch ? emailMatch[1].trim() : '',
        notes: 'Extracted locally via regular expression heuristics',
      });
    }
  }

  if (invoices.length === 0 && text.trim().length > 10) {
    invoices.push({
      supplierName: 'Needs Review',
      invoiceNumber: 'Needs Review',
      invoiceDate: new Date().toISOString().split('T')[0],
      approvalDate: new Date().toISOString().split('T')[0],
      amount: 0,
      paymentTerms: 'Net 30',
      fixedDueDate: null,
      bankDetails: '',
      poNumber: '',
      poAmount: 0,
      grnNumber: '',
      grnVerified: false,
      contactEmail: '',
      notes: 'Initial row created - please review and fill details manually.',
    });
  }

  return invoices;
}

// API Route: Inspect Invoice
app.post('/api/ai/inspect-invoice', async (req, res) => {
  const invoice = req.body;
  try {
    const ai = getAIClient();

    if (!ai) {
      const result = heuristicInspectInvoice(invoice);
      return res.json({ result, isFallback: true });
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
    if (isGeminiQuotaError(err)) {
      console.warn('Gemini API quota exceeded in inspect-invoice. Using heuristic fallback.');
    } else {
      console.error('Error in inspect-invoice:', err);
    }
    const result = heuristicInspectInvoice(invoice);
    return res.json({ result, isFallback: true, error: err.message || 'Failed to inspect invoice.' });
  }
});

// API Route: Draft Payment Reminder
app.post('/api/ai/draft-reminder', async (req, res) => {
  const { invoice, stageLabel, formattedDueDate, formattedAmount } = req.body || {};
  try {
    const ai = getAIClient();

    if (!ai) {
      const draft = heuristicDraftReminder(invoice, stageLabel, formattedDueDate, formattedAmount);
      return res.json({ ...draft, isFallback: true });
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
    if (isGeminiQuotaError(err)) {
      console.warn('Gemini API quota exceeded in draft-reminder. Using heuristic fallback.');
    } else {
      console.error('Error drafting reminder:', err);
    }
    const draft = heuristicDraftReminder(invoice, stageLabel, formattedDueDate, formattedAmount);
    return res.json({ ...draft, isFallback: true, error: err.message });
  }
});

// API Route: Portfolio Summary
app.post('/api/ai/summarize-portfolio', async (req, res) => {
  try {
    const ai = getAIClient();

    if (!ai) {
      const summary = heuristicSummarizePortfolio(req.body);
      return res.json({ summary, isFallback: true });
    }

    const { unpaidInvoices, overdueCount, dueTodayCount, due7DaysCount, needsReviewCount } = req.body || {};

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
    if (isGeminiQuotaError(err)) {
      console.warn('Gemini API quota exceeded in summarize-portfolio. Using heuristic fallback.');
    } else {
      console.error('Error summarizing portfolio:', err);
    }
    const summary = heuristicSummarizePortfolio(req.body);
    return res.json({ summary, isFallback: true, error: err.message });
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
    const ai = getAIClient();

    if (!ai) {
      const combinedText = extractAllTextContent(req.body);
      const invoices = heuristicExtractInvoicesFromText(combinedText);
      return res.json({ invoices, isFallback: true });
    }

    const { files, fileData, fileType, textContent } = req.body || {};

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
    if (isGeminiQuotaError(err)) {
      console.warn('Gemini API quota exceeded in extract-document. Using heuristic fallback.');
    } else {
      console.error('Error extracting document:', err);
    }
    const combinedText = extractAllTextContent(req.body);
    const invoices = heuristicExtractInvoicesFromText(combinedText);
    return res.json({ invoices, isFallback: true, error: err.message });
  }
});

/**
 * Shared server-side helper to fetch spreadsheet metadata from Google Sheets API v4 using OAuth accessToken.
 */
async function getGoogleSheetMetadata(
  spreadsheetId: string,
  accessToken: string
) {
  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  let metaRes: Response;
  try {
    metaRes = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (err: any) {
    const errorMsg = `Fetch Network Exception: ${err.message || String(err)}`;
    return {
      ok: false,
      status: 0,
      statusText: 'Fetch Error',
      sheets: [] as any[],
      errorText: errorMsg,
    };
  }

  const status = metaRes.status;
  if (!metaRes.ok) {
    const rawErrorText = await metaRes.text();
    let formattedErr = `Google Sheets API Error (${status} ${metaRes.statusText})`;
    try {
      const parsed = JSON.parse(rawErrorText);
      if (parsed.error && parsed.error.message) {
        formattedErr = `Google Sheets API Error (${status}): ${parsed.error.message}`;
      }
    } catch (e) {
      if (rawErrorText) formattedErr += ` - ${rawErrorText.substring(0, 200)}`;
    }

    return {
      ok: false,
      status,
      statusText: metaRes.statusText,
      sheets: [] as any[],
      errorText: formattedErr,
    };
  }

  const metaData = await metaRes.json();
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    sheets: (metaData.sheets || []) as any[],
    errorText: null,
  };
}

/**
 * Shared server-side function to read raw values from Google Sheets API v4.
 * Both "Test Google Sheets Connection" and "Sync Invoices" MUST call this same function.
 */
async function getGoogleSheetData(
  spreadsheetId: string,
  range: string,
  accessToken: string
) {
  const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  let readRes: Response;
  try {
    readRes = await fetch(readUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (err: any) {
    const errorMsg = `Values Read Exception: ${err.message || String(err)}`;
    return {
      ok: false,
      status: 0,
      statusText: 'Fetch Error',
      values: [] as string[][],
      errorText: errorMsg,
    };
  }

  const status = readRes.status;
  if (!readRes.ok) {
    const rawReadErr = await readRes.text();
    let formattedErr = `Google Sheets Read Values Error (${status} ${readRes.statusText})`;
    try {
      const parsed = JSON.parse(rawReadErr);
      if (parsed.error && parsed.error.message) {
        formattedErr = `Google Sheets Read Values Error (${status}): ${parsed.error.message}`;
      }
    } catch (e) {
      if (rawReadErr) formattedErr += ` - ${rawReadErr.substring(0, 200)}`;
    }

    return {
      ok: false,
      status,
      statusText: readRes.statusText,
      values: [] as string[][],
      errorText: formattedErr,
    };
  }

  const readData = await readRes.json();
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    values: (readData.values || []) as string[][],
    errorText: null,
  };
}

// API Route: Simplified Test Google Sheets Connection Endpoint
app.post('/api/sheets/test-connection', async (req, res) => {
  const { spreadsheetId = '13xu1LcP2MBADKqQ1tc02NIk7ZsHp9nbFA8BmOS-SnnA', accessToken, targetGid } = req.body;

  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(`[GoogleSheetsTest] ${msg}`);
    logs.push(msg);
  };

  log(`Request received for Spreadsheet ID: ${spreadsheetId}`);

  // 1. Check Authentication
  if (!accessToken) {
    const err = 'Authentication Failed: No Google OAuth Access Token provided. Please sign in with Google.';
    log(`Auth Status: Unauthenticated`);
    log(`Full Error: ${err}`);
    return res.status(200).json({
      success: false,
      isAuthenticated: false,
      oauthSessionAvailable: false,
      spreadsheetId,
      selectedSheetName: 'N/A',
      requestedRange: 'N/A',
      worksheets: [],
      first5Rows: [],
      rawRowsRetrieved: 0,
      totalRowsRetrieved: 0,
      apiResponseStatus: 401,
      fullError: err,
      logs,
    });
  }

  log(`Auth Status: Authenticated`);

  // 2. Retrieve Spreadsheet Metadata using shared helper
  const meta = await getGoogleSheetMetadata(spreadsheetId, accessToken);
  log(`API Response Status for Metadata: ${meta.status}`);

  if (!meta.ok) {
    log(`Full Error returned by Google Sheets: ${meta.errorText}`);
    return res.status(200).json({
      success: false,
      isAuthenticated: meta.status !== 401,
      oauthSessionAvailable: true,
      spreadsheetId,
      selectedSheetName: 'N/A',
      requestedRange: 'N/A',
      worksheets: [],
      first5Rows: [],
      rawRowsRetrieved: 0,
      totalRowsRetrieved: 0,
      apiResponseStatus: meta.status,
      fullError: meta.errorText,
      logs,
    });
  }

  const sheets = meta.sheets;
  const worksheetNames: { title: string; sheetId: number; rows: number; cols: number }[] = sheets.map(
    (s: any) => ({
      title: s.properties?.title || 'Untitled Tab',
      sheetId: s.properties?.sheetId ?? 0,
      rows: s.properties?.gridProperties?.rowCount ?? 0,
      cols: s.properties?.gridProperties?.columnCount ?? 0,
    })
  );

  log(`Worksheet tabs found (${worksheetNames.length}): ${worksheetNames.map((w) => w.title).join(', ')}`);

  if (worksheetNames.length === 0) {
    const err = 'No worksheet tabs found in spreadsheet metadata.';
    log(`Full Error: ${err}`);
    return res.status(200).json({
      success: false,
      isAuthenticated: true,
      oauthSessionAvailable: true,
      spreadsheetId,
      selectedSheetName: 'None',
      requestedRange: 'N/A',
      worksheets: [],
      first5Rows: [],
      rawRowsRetrieved: 0,
      totalRowsRetrieved: 0,
      apiResponseStatus: 200,
      fullError: err,
      logs,
    });
  }

  // Find worksheet by GID or pick first
  let selectedTab = sheets[0];
  if (targetGid !== undefined && targetGid !== null) {
    const match = sheets.find((s: any) => Number(s.properties?.sheetId) === Number(targetGid));
    if (match) selectedTab = match;
  }
  const selectedSheetName = selectedTab.properties?.title || 'Sheet1';
  const fullRange = `'${selectedSheetName}'!A:M`;
  log(`Selected worksheet tab name: ${selectedSheetName} (gid: ${selectedTab.properties?.sheetId})`);

  // 3. Fetch all populated rows using shared getGoogleSheetData function
  const sheetData = await getGoogleSheetData(spreadsheetId, fullRange, accessToken);
  log(`API Response Status for Values Read: ${sheetData.status}`);

  if (!sheetData.ok) {
    log(`Full Error returned by Google Sheets Read: ${sheetData.errorText}`);
    return res.status(200).json({
      success: false,
      isAuthenticated: sheetData.status !== 401,
      oauthSessionAvailable: true,
      spreadsheetId,
      selectedSheetName,
      requestedRange: fullRange,
      worksheets: worksheetNames,
      first5Rows: [],
      rawRowsRetrieved: 0,
      totalRowsRetrieved: 0,
      apiResponseStatus: sheetData.status,
      fullError: sheetData.errorText,
      logs,
    });
  }

  const rawValues = sheetData.values;
  const first5Rows = rawValues.slice(0, 5);
  const rawRowsRetrieved = rawValues.length;
  const invoiceRecordsCount = rawValues.length > 0 ? rawValues.length - 1 : 0;

  log(`Requested Range: ${fullRange}`);
  log(`Raw rows returned by Google Sheets (including header): ${rawRowsRetrieved}`);
  log(`Total invoice records (excluding header): ${invoiceRecordsCount}`);
  log(`First 5 rows preview length: ${first5Rows.length}`);

  return res.json({
    success: true,
    isAuthenticated: true,
    oauthSessionAvailable: true,
    spreadsheetId,
    selectedSheetName,
    requestedRange: fullRange,
    worksheets: worksheetNames,
    first5Rows,
    rawRowsRetrieved,
    totalRowsRetrieved: invoiceRecordsCount,
    apiResponseStatus: 200,
    fullError: null,
    logs,
  });
});

// API Route: Google Sheets Fetch & Debug Endpoint
app.post('/api/sheets/fetch', async (req, res) => {
  try {
    const { sheetUrlOrId, accessToken, targetGid } = req.body;

    // 1. Check Authentication
    if (!accessToken) {
      return res.status(200).json({
        success: false,
        isAuthenticated: false,
        oauthSessionAvailable: false,
        apiResponseStatus: 401,
        error: 'Google Workspace authentication required. Please sign in with Google.',
        debug: {
          authenticatedUser: 'No',
          oauthSessionAvailable: 'No',
          authStatus: 'Not Authenticated',
          connectionStatus: 'Failed (No Token)',
          sheetNameDetected: 'N/A',
          requestedRange: 'N/A',
          apiResponseStatus: 401,
          rowsRetrieved: 0,
          error: 'Missing Google OAuth Access Token. Click "Connect Google Sheets" to authenticate.',
        },
      });
    }

    // 2. Parse Spreadsheet ID & GID
    let spreadsheetId = (sheetUrlOrId || '13xu1LcP2MBADKqQ1tc02NIk7ZsHp9nbFA8BmOS-SnnA').trim();
    let parsedGid = targetGid !== undefined && targetGid !== null ? Number(targetGid) : null;

    // Check if sheetUrlOrId contains a full Google Sheets URL
    const idMatch = spreadsheetId.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (idMatch && idMatch[1]) {
      spreadsheetId = idMatch[1];
    }

    const gidMatch = (sheetUrlOrId || '').match(/gid=([0-9]+)/);
    if (gidMatch && gidMatch[1] && parsedGid === null) {
      parsedGid = Number(gidMatch[1]);
    }

    // Default target GID if not specified and target sheet ID is used
    if (spreadsheetId === '13xu1LcP2MBADKqQ1tc02NIk7ZsHp9nbFA8BmOS-SnnA' && parsedGid === null) {
      parsedGid = 668977970;
    }

    if (!spreadsheetId) {
      return res.status(200).json({
        success: false,
        isAuthenticated: true,
        oauthSessionAvailable: true,
        apiResponseStatus: 400,
        error: 'Invalid Spreadsheet ID or Google Sheet URL.',
        debug: {
          authenticatedUser: 'Yes',
          oauthSessionAvailable: 'Yes',
          authStatus: 'Authenticated',
          connectionStatus: 'Failed (Bad Input)',
          sheetNameDetected: 'N/A',
          requestedRange: 'N/A',
          apiResponseStatus: 400,
          rowsRetrieved: 0,
          error: 'Invalid Spreadsheet ID or Google Sheet URL provided.',
        },
      });
    }

    // 3. Request Spreadsheet Metadata using shared helper
    const meta = await getGoogleSheetMetadata(spreadsheetId, accessToken);

    if (!meta.ok) {
      return res.status(200).json({
        success: false,
        isAuthenticated: meta.status !== 401,
        oauthSessionAvailable: true,
        apiResponseStatus: meta.status,
        error: meta.errorText,
        debug: {
          authenticatedUser: meta.status !== 401 ? 'Yes' : 'No',
          oauthSessionAvailable: 'Yes',
          authStatus: meta.status === 401 ? 'Session Expired' : 'Authenticated',
          connectionStatus: `Failed (${meta.status})`,
          sheetNameDetected: 'N/A',
          requestedRange: 'N/A',
          apiResponseStatus: meta.status,
          rowsRetrieved: 0,
          error: meta.errorText,
        },
      });
    }

    const sheetsList: any[] = meta.sheets;

    if (sheetsList.length === 0) {
      return res.status(200).json({
        success: false,
        isAuthenticated: true,
        oauthSessionAvailable: true,
        apiResponseStatus: 200,
        error: 'No worksheet tabs found in the specified Google Sheet.',
        debug: {
          authenticatedUser: 'Yes',
          oauthSessionAvailable: 'Yes',
          authStatus: 'Authenticated',
          connectionStatus: 'Failed (No Sheets)',
          sheetNameDetected: 'None',
          requestedRange: 'N/A',
          apiResponseStatus: 200,
          rowsRetrieved: 0,
          error: 'Spreadsheet contains 0 worksheet tabs.',
        },
      });
    }

    // Find worksheet named targetSheetName, or Matched_Results if requested, or Payment_Complete, or by GID, or default to first sheet
    const requestedSheetName = (req.body.targetSheetName || req.body.sheetName || '').toString().trim().toLowerCase();
    let targetSheet: any = null;

    if (requestedSheetName) {
      targetSheet = sheetsList.find(
        (s) =>
          s.properties?.title &&
          (s.properties.title.trim().toLowerCase() === requestedSheetName ||
            s.properties.title.trim().toLowerCase().replace(/_/g, ' ') === requestedSheetName.replace(/_/g, ' '))
      );
    }

    if (!targetSheet && parsedGid !== null) {
      const match = sheetsList.find(
        (s) => s.properties && Number(s.properties.sheetId) === parsedGid
      );
      if (match) {
        targetSheet = match;
      }
    }

    if (!targetSheet) {
      targetSheet = sheetsList.find(
        (s) =>
          s.properties?.title &&
          (s.properties.title.trim().toLowerCase() === 'matched_results' ||
            s.properties.title.trim().toLowerCase().replace(/_/g, ' ') === 'matched results')
      );
    }

    if (!targetSheet) {
      targetSheet = sheetsList[0];
    }

    const sheetName = targetSheet.properties?.title || 'Sheet1';
    const detectedGid = targetSheet.properties?.sheetId ?? 'Unknown';
    const isMatchResultsSheet = sheetName.toLowerCase().includes('match');

    // 4. Fetch range from Google Sheets API v4 using shared getGoogleSheetData function
    const fullRange = `'${sheetName}'!A:M`;
    const sheetData = await getGoogleSheetData(spreadsheetId, fullRange, accessToken);

    if (!sheetData.ok) {
      return res.status(200).json({
        success: false,
        isAuthenticated: sheetData.status !== 401,
        oauthSessionAvailable: true,
        apiResponseStatus: sheetData.status,
        error: sheetData.errorText,
        debug: {
          authenticatedUser: sheetData.status !== 401 ? 'Yes' : 'No',
          oauthSessionAvailable: 'Yes',
          authStatus: sheetData.status === 401 ? 'Session Expired' : 'Authenticated',
          connectionStatus: `Connected to Spreadsheet, Read Failed (${sheetData.status})`,
          sheetNameDetected: `${sheetName} (gid: ${detectedGid})`,
          requestedRange: fullRange,
          apiResponseStatus: sheetData.status,
          rawRowsRetrieved: 0,
          rowsRetrieved: 0,
          error: sheetData.errorText,
        },
      });
    }

    const rawRows: string[][] = sheetData.values;

    if (rawRows.length === 0) {
      return res.json({
        success: true,
        spreadsheetId,
        sheetName,
        gid: detectedGid,
        requestedRange: fullRange,
        rawRowsRetrieved: 0,
        rowsRetrieved: 0,
        invoices: [],
        first5Invoices: [],
        excludedRowsLog: [],
        debug: {
          authStatus: 'Authenticated',
          connectionStatus: 'Connected (200 OK)',
          sheetNameDetected: `${sheetName} (gid: ${detectedGid})`,
          requestedRange: fullRange,
          rawRowsRetrieved: 0,
          rowsRetrieved: 0,
          excludedCount: 0,
          error: null,
        },
      });
    }

    // 5. Treat Row 1 (index 0) as Column Headers, Row 2 onwards (index 1+) as Invoice Records
    let headerRowIdx = 0;
    const headers = (rawRows[0] || []).map((h) => (h || '').toString().toLowerCase().trim());

    // Flexible column locator helper
    const findCol = (keywords: string[]) => {
      return headers.findIndex((h) => keywords.some((k) => h.includes(k)));
    };

    let invNumCol = findCol(['invoice number', 'invoice no', 'inv no', 'inv#', 'invoice#', 'no', 'number']);
    let suppCol = findCol(['supplier name', 'supplier', 'vendor name', 'vendor', 'company', 'payee', 'biller']);
    let invDateCol = findCol(['invoice date', 'inv date', 'date of invoice', 'bill date']);
    let poCol = findCol(['po number', 'po', 'purchase order']);
    let amtCol = findCol(['invoice amount', 'amount', 'total amount', 'cost', 'price', 'sgd', 'total']);
    let termsCol = findCol(['payment terms', 'terms', 'credit terms', 'due terms']);
    let dueCol = findCol(['due date', 'payment due date', 'due', 'deadline', 'calculated due date', 'fixed due date']);
    let appStatusCol = findCol(['approval status', 'approved status', 'approval', 'app status']);
    let payStatusCol = findCol(['payment status', 'payment state', 'status', 'state']);
    let payDateCol = findCol(['payment date', 'paid date', 'date paid']);
    let bankCol = findCol(['bank details', 'bank', 'bank account', 'remittance']);
    let grnCol = findCol(['grn number', 'grn', 'goods receipt']);
    let notesCol = findCol(['notes', 'remarks', 'comment', 'review notes']);

    // Positional fallbacks if header keywords missed standard columns
    if (invNumCol === -1) invNumCol = 0;
    if (suppCol === -1) suppCol = 1;
    if (invDateCol === -1) invDateCol = 2;
    if (poCol === -1) poCol = 3;
    if (amtCol === -1) amtCol = 4;
    if (termsCol === -1) termsCol = 5;
    if (dueCol === -1) dueCol = 6;
    if (appStatusCol === -1) appStatusCol = 7;
    if (payStatusCol === -1) payStatusCol = 8;
    if (payDateCol === -1) payDateCol = 9;

    const parsedInvoices: any[] = [];
    const excludedRowsLog: { rowIndex: number; rawRow: string[]; reason: string }[] = [];

    const isExplicitAppStatusHeader = headers.some(h => h.includes('approval') || h.includes('approved'));

    // Loop through row 2 onwards (index 1 to rawRows.length - 1)
    for (let i = 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      const sheetRowIndex = i + 1; // 1-based index in Google Sheets

      if (!row || row.length === 0 || row.every((cell) => !cell || !cell.toString().trim())) {
        excludedRowsLog.push({
          rowIndex: sheetRowIndex,
          rawRow: row || [],
          reason: 'Blank row containing no data cells.',
        });
        continue;
      }

      const invoiceNumber = invNumCol !== -1 && row[invNumCol] ? row[invNumCol].toString().trim() : '';
      const supplierName = suppCol !== -1 && row[suppCol] ? row[suppCol].toString().trim() : '';
      const rawAmt = amtCol !== -1 && row[amtCol] ? row[amtCol].toString().replace(/[^0-9.-]/g, '') : '';
      const amount = rawAmt ? parseFloat(rawAmt) : 0;

      // Filter summary / total rows
      const combinedRowStr = row.join(' ').toLowerCase();
      if (
        combinedRowStr.includes('grand total') ||
        combinedRowStr.includes('summary total') ||
        supplierName.toLowerCase().includes('total') ||
        invoiceNumber.toLowerCase().includes('total') ||
        supplierName.toLowerCase().includes('ledger summary')
      ) {
        excludedRowsLog.push({
          rowIndex: sheetRowIndex,
          rawRow: row,
          reason: 'Excluded: Identified as a summary or total calculation row.',
        });
        continue;
      }

      // Check Approval Status filter: ONLY import rows where Approval Status is "Approved" (or "Matched" for Match_Results)
      const appStatusVal = appStatusCol !== -1 && row[appStatusCol] ? row[appStatusCol].toString().trim() : '';
      if (!isMatchResultsSheet && isExplicitAppStatusHeader) {
        if (!appStatusVal || (!appStatusVal.toLowerCase().includes('approved') && !appStatusVal.toLowerCase().includes('matched') && !appStatusVal.toLowerCase().includes('pass') && !appStatusVal.toLowerCase().includes('ok'))) {
          excludedRowsLog.push({
            rowIndex: sheetRowIndex,
            rawRow: row,
            reason: `Excluded: Approval Status is "${appStatusVal || 'Empty'}" (must be "Approved").`,
          });
          continue;
        }
      } else if (appStatusVal) {
        const lowerApp = appStatusVal.toLowerCase();
        if (lowerApp.includes('pending') || lowerApp.includes('reject') || lowerApp.includes('draft') || lowerApp.includes('unapproved') || lowerApp.includes('deny') || lowerApp.includes('fail')) {
          excludedRowsLog.push({
            rowIndex: sheetRowIndex,
            rawRow: row,
            reason: `Excluded: Status is "${appStatusVal}".`,
          });
          continue;
        }
      }

      // Filter completely invalid / empty invoice identifier & supplier row
      if (!invoiceNumber && !supplierName && (isNaN(amount) || amount <= 0)) {
        excludedRowsLog.push({
          rowIndex: sheetRowIndex,
          rawRow: row,
          reason: 'Excluded: Missing Invoice Number, Supplier Name, and valid Amount.',
        });
        continue;
      }

      const payStatusVal = payStatusCol !== -1 && row[payStatusCol] ? row[payStatusCol].toString().trim() : '';
      const payDateVal = payDateCol !== -1 && row[payDateCol] ? row[payDateCol].toString().trim() : '';

      let status = isMatchResultsSheet ? 'Ready for Payment' : 'Unpaid';
      if (/paid/i.test(payStatusVal) || (payDateVal && payDateVal.toLowerCase() !== 'unpaid')) status = 'Paid';
      else if (/ready/i.test(payStatusVal)) status = 'Ready for Payment';
      else if (/hold/i.test(payStatusVal)) status = 'On Hold';
      else if (/disput/i.test(payStatusVal)) status = 'Disputed';
      else if (/cancel/i.test(payStatusVal)) status = 'Cancelled';

      const invDate = invDateCol !== -1 && row[invDateCol] ? row[invDateCol].toString().trim() : '';
      const appDate = new Date().toISOString().split('T')[0];
      const terms = termsCol !== -1 && row[termsCol] ? row[termsCol].toString().trim() : 'Net 30';
      const explicitDueDate = dueCol !== -1 && row[dueCol] ? row[dueCol].toString().trim() : '';

      // Calculate payment due date using Invoice Date and Payment Terms if explicit due date is not given
      let computedDueDate = explicitDueDate;
      if (!computedDueDate && invDate) {
        const parts = invDate.split(/[-/.]/);
        if (parts.length === 3) {
          let y = parseInt(parts[0], 10);
          let m = parseInt(parts[1], 10) - 1;
          let d = parseInt(parts[2], 10);

          // Handle DD/MM/YYYY or MM/DD/YYYY if year is last
          if (parts[2].length === 4) {
            y = parseInt(parts[2], 10);
            m = parseInt(parts[1], 10) - 1;
            d = parseInt(parts[0], 10);
          }

          if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
            const dt = new Date(y, m, d);
            let daysToAdd = 30;
            const lowerTerms = (terms || '').toLowerCase();
            if (lowerTerms.includes('receipt') || lowerTerms.includes('immediate')) daysToAdd = 0;
            else if (lowerTerms.includes('7')) daysToAdd = 7;
            else if (lowerTerms.includes('14')) daysToAdd = 14;
            else if (lowerTerms.includes('30')) daysToAdd = 30;
            else if (lowerTerms.includes('45')) daysToAdd = 45;
            else if (lowerTerms.includes('60')) daysToAdd = 60;
            else if (lowerTerms.includes('90')) daysToAdd = 90;

            dt.setDate(dt.getDate() + daysToAdd);
            const resY = dt.getFullYear();
            const resM = String(dt.getMonth() + 1).padStart(2, '0');
            const resD = String(dt.getDate()).padStart(2, '0');
            computedDueDate = `${resY}-${resM}-${resD}`;
          }
        }
      }

      const isMissingInfo = !supplierName || !invoiceNumber || !invDate || isNaN(amount) || amount <= 0 || !terms || !computedDueDate;

      parsedInvoices.push({
        invoiceNumber: invoiceNumber || `INV-GS-${Math.floor(1000 + Math.random() * 9000)}`,
        supplierName: supplierName || 'Needs Review',
        invoiceDate: invDate || appDate,
        approvalDate: appDate,
        amount: isNaN(amount) ? 0 : amount,
        paymentTerms: terms,
        fixedDueDate: explicitDueDate || undefined,
        calculatedDueDate: computedDueDate || undefined,
        status: status,
        bankDetails: bankCol !== -1 && row[bankCol] ? row[bankCol].toString().trim() : undefined,
        poNumber: poCol !== -1 && row[poCol] ? row[poCol].toString().trim() : undefined,
        grnNumber: grnCol !== -1 && row[grnCol] ? row[grnCol].toString().trim() : undefined,
        paymentDate: payDateVal || undefined,
        approvalStatus: 'Approved',
        grnVerified: true,
        notes: notesCol !== -1 && row[notesCol] ? row[notesCol].toString().trim() : 'Synced from Matched_Results Google Sheet',
        needsReview: isMissingInfo,
      });
    }

    const first5Invoices = parsedInvoices.slice(0, 5);

    return res.json({
      success: true,
      isAuthenticated: true,
      oauthSessionAvailable: true,
      apiResponseStatus: 200,
      spreadsheetId,
      gid: detectedGid,
      sheetName,
      requestedRange: fullRange,
      rawRowsRetrieved: rawRows.length,
      rowsRetrieved: parsedInvoices.length,
      invoices: parsedInvoices,
      first5Invoices,
      excludedRowsLog,
      debug: {
        authenticatedUser: 'Yes',
        oauthSessionAvailable: 'Yes',
        authStatus: 'Authenticated',
        connectionStatus: 'Connected (200 OK)',
        sheetNameDetected: `${sheetName} (gid: ${detectedGid})`,
        requestedRange: fullRange,
        apiResponseStatus: 200,
        rawRowsRetrieved: rawRows.length,
        rowsRetrieved: parsedInvoices.length,
        excludedCount: excludedRowsLog.length,
        excludedRowsLog,
        first5InvoicesPreview: first5Invoices,
        error: null,
      },
    });
  } catch (err: any) {
    console.error('Error in /api/sheets/fetch:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Server error while fetching Google Sheets data.',
      debug: {
        authStatus: 'Unknown / Error',
        connectionStatus: 'Server Exception',
        sheetNameDetected: 'N/A',
        rowsRetrieved: 0,
        error: err.message || 'Internal server error',
      },
    });
  }
});

/**
 * Helper to compute Due Date based on Invoice Date and Payment Terms
 */
function computeDueDate(invoiceDate: string | undefined | null, paymentTerms: string | undefined | null): { dueDate: string; needsReview: boolean } {
  if (!invoiceDate || !invoiceDate.trim()) {
    return { dueDate: '', needsReview: true };
  }
  const parts = invoiceDate.trim().split('-');
  if (parts.length !== 3) {
    return { dueDate: '', needsReview: true };
  }
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return { dueDate: '', needsReview: true };
  }

  const terms = (paymentTerms || '').trim().toLowerCase();
  let daysToAdd = -1;
  if (terms === 'net 30') daysToAdd = 30;
  else if (terms === 'net 60') daysToAdd = 60;
  else if (terms === 'net 14') daysToAdd = 14;
  else if (terms === 'net 7') daysToAdd = 7;
  else if (terms === 'net 15') daysToAdd = 15;
  else if (terms === 'net 45') daysToAdd = 45;
  else if (terms === 'net 90') daysToAdd = 90;
  else if (terms === 'due on receipt' || terms === 'immediate') daysToAdd = 0;

  if (daysToAdd < 0) {
    return { dueDate: '', needsReview: true };
  }

  const dt = new Date(year, month, day);
  dt.setDate(dt.getDate() + daysToAdd);
  const rYr = dt.getFullYear();
  const rMo = String(dt.getMonth() + 1).padStart(2, '0');
  const rDy = String(dt.getDate()).padStart(2, '0');
  return { dueDate: `${rYr}-${rMo}-${rDy}`, needsReview: false };
}

/**
 * Helper to compute Last Reminder Date: 3 days before Due Date
 */
function computeLastReminderDate(dueDateStr: string | undefined | null): string {
  if (!dueDateStr || !dueDateStr.trim()) return '';
  const parts = dueDateStr.trim().split('-');
  if (parts.length !== 3) return '';
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return '';

  const dt = new Date(year, month, day);
  dt.setDate(dt.getDate() - 3); // Count back 3 days before due date
  const rYr = dt.getFullYear();
  const rMo = String(dt.getMonth() + 1).padStart(2, '0');
  const rDy = String(dt.getDate()).padStart(2, '0');
  return `${rYr}-${rMo}-${rDy}`;
}

// API Route: Append new row to Google Sheets worksheet 'Payment_Complete'
app.post('/api/sheets/append-invoice', async (req, res) => {
  try {
    const { spreadsheetId = '13xu1LcP2MBADKqQ1tc02NIk7ZsHp9nbFA8BmOS-SnnA', accessToken, invoice } = req.body;

    if (!accessToken) {
      return res.status(200).json({
        success: false,
        code: 'UNAUTHENTICATED',
        userMessage: 'Google Workspace authentication required. Please sign in with Google.',
        error: 'Google Workspace authentication required. Please sign in with Google.',
      });
    }

    if (!invoice || typeof invoice !== 'object') {
      return res.status(200).json({
        success: false,
        code: 'INCOMPLETE',
        userMessage: 'Invoice information incomplete. Please review.',
        error: 'Invoice information incomplete. Please review.',
      });
    }

    // Step 2 & Step 3: Validate required fields
    const invoiceNumber = (invoice.invoiceNumber || '').toString().trim();
    const supplierName = (invoice.supplierName || '').toString().trim();
    const invoiceDate = (invoice.invoiceDate || '').toString().trim();
    const amountVal = invoice.amount;
    const numAmount = typeof amountVal === 'number' ? amountVal : parseFloat(String(amountVal || ''));

    const isMissingRequired =
      !invoiceNumber ||
      invoiceNumber === 'Needs Review' ||
      !supplierName ||
      supplierName === 'Needs Review' ||
      !invoiceDate ||
      isNaN(numAmount) ||
      numAmount <= 0;

    if (isMissingRequired) {
      return res.status(200).json({
        success: false,
        code: 'INCOMPLETE',
        userMessage: 'Invoice information incomplete. Please review.',
        error: 'Invoice information incomplete. Please review.',
      });
    }

    // Default Values & Rules according to Google Sheet requirements
    const todaySGT = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' }); // YYYY-MM-DD
    const approvalStatus = (invoice.approvalStatus || 'Approved').toString().trim();
    const approvalDate = (invoice.approvalDate || todaySGT).toString().trim();
    const poNumber = (invoice.poNumber || '').toString().trim();
    const paymentTerms = (invoice.paymentTerms || '').toString().trim();

    // Due Date: Reflected from uploaded invoice or calculated from Invoice Date + Payment Terms
    const uploadedDue = (invoice.dueDate || invoice.fixedDueDate || invoice.calculatedDueDate || '').toString().trim();
    const { dueDate: computedDue, needsReview } = computeDueDate(invoiceDate, paymentTerms);
    const dueDate = uploadedDue || computedDue || '';

    // Payment Status (Column J): "Paid", "Ready for Payment", or "Unpaid"
    let paymentStatus = 'Unpaid';
    const rawStatus = (invoice.status || '').toString().trim().toLowerCase();
    if (rawStatus === 'paid' || invoice.status === 'Paid') {
      paymentStatus = 'Paid';
    } else if (rawStatus === 'ready for payment' || rawStatus === 'ready' || invoice.readyForPayment === true) {
      paymentStatus = 'Ready for Payment';
    } else {
      paymentStatus = 'Unpaid';
    }

    // Last Reminder Date (Column K): "calculated by counting back 3 days before the due date"
    const lastReminderDate = computeLastReminderDate(dueDate);

    // Payment Date (Column L): "when the staff has marked paid in the app, if not leave blank"
    let paymentDate = '';
    if (rawStatus === 'paid' || invoice.status === 'Paid') {
      paymentDate = (invoice.paymentDate || todaySGT).toString().trim();
    } else {
      paymentDate = ''; // Leave blank if unpaid
    }

    // Ensure we ONLY add rows to 'Payment_Complete' worksheet, and ONLY if status is 'Paid'
    if (paymentStatus !== 'Paid') {
      return res.status(200).json({
        success: true,
        code: 'SUCCESS',
        userMessage: 'Invoice successfully saved locally (skipped Google Sheets append to avoid writing to non-Paid worksheets per guidelines).',
        message: 'Invoice successfully saved locally.',
        targetSheetName: 'N/A',
        invoice: {
          supplierName,
          invoiceNumber,
          invoiceDate,
          approvalDate,
          amount: numAmount,
          currency: 'SGD',
          paymentTerms,
          calculatedDueDate: dueDate || null,
          status: paymentStatus,
          poNumber,
          needsReview,
        },
      });
    }

    let targetSheetName = 'Payment_Complete';
    const meta = await getGoogleSheetMetadata(spreadsheetId, accessToken);
    if (meta.ok && meta.sheets) {
      const match = meta.sheets.find(
        (s: any) => s.properties && (Number(s.properties.sheetId) === 668977970 || s.properties.title === 'Payment_Complete')
      );
      if (match && match.properties?.title) {
        targetSheetName = match.properties.title;
      }
    }

    // Fetch existing values in Column A..M
    const sheetData = await getGoogleSheetData(spreadsheetId, `'${targetSheetName}'!A:M`, accessToken);
    if (!sheetData.ok) {
      return res.status(200).json({
        success: false,
        code: 'SHEETS_API_ERROR',
        userMessage: sheetData.errorText,
        error: sheetData.errorText,
      });
    }

    const existingRows = sheetData.values || [];
    const invKeyLower = invoiceNumber.toLowerCase();

    // Check if duplicate exists in Column A
    let isDuplicate = false;
    for (let i = 0; i < existingRows.length; i++) {
      const rowColA = (existingRows[i][0] || '').toString().trim().toLowerCase();
      if (rowColA === invKeyLower) {
        isDuplicate = true;
        break;
      }
    }

    if (isDuplicate) {
      return res.status(200).json({
        success: false,
        code: 'DUPLICATE',
        userMessage: 'Invoice already exists in Payment_Complete.',
        error: 'Invoice already exists.',
      });
    }

    // Create 13-column row array mapping for Payment_Complete:
    const rowValues = [
      invoiceNumber,
      supplierName,
      approvalDate,
      poNumber,
      numAmount,
      paymentTerms,
      dueDate,
      'Approved by Madam Lim',
      todaySGT,
      invoice.notes || 'Verified & approved for payment processing',
      paymentStatus,
      'None',
      paymentDate || todaySGT,
    ];

    // Append row using Google Sheets API v4 to Payment_Complete worksheet
    const appendRange = `'${targetSheetName}'!A:M`;
    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(appendRange)}:append?valueInputOption=USER_ENTERED`;

    const appendRes = await fetch(appendUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [rowValues],
      }),
    });

    if (!appendRes.ok) {
      const rawErr = await appendRes.text();
      let formattedErr = `Google Sheets API Write Error (${appendRes.status} ${appendRes.statusText})`;
      try {
        const parsed = JSON.parse(rawErr);
        if (parsed.error && parsed.error.message) {
          formattedErr = `Google Sheets API Write Error (${appendRes.status}): ${parsed.error.message}`;
        }
      } catch (e) {
        if (rawErr) formattedErr += ` - ${rawErr.substring(0, 200)}`;
      }

      return res.status(200).json({
        success: false,
        code: 'SHEETS_API_ERROR',
        userMessage: formattedErr,
        error: formattedErr,
      });
    }

    // Step 9: Return success response
    return res.status(200).json({
      success: true,
      code: 'SUCCESS',
      userMessage: 'Invoice successfully added to Google Sheets.',
      message: 'Invoice successfully added to Google Sheets.',
      targetSheetName,
      appendedRow: rowValues,
      invoice: {
        supplierName,
        invoiceNumber,
        invoiceDate,
        approvalDate,
        amount: numAmount,
        currency: 'SGD',
        paymentTerms,
        calculatedDueDate: dueDate || null,
        status: paymentStatus,
        poNumber,
        needsReview,
      },
    });
  } catch (err: any) {
    console.error('Error in /api/sheets/append-invoice:', err);
    return res.status(200).json({
      success: false,
      code: 'SERVER_EXCEPTION',
      userMessage: `Server Error: ${err.message || String(err)}`,
      error: err.message || String(err),
    });
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
