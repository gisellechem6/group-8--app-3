import React, { useState } from 'react';
import { X, FileText, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Sparkles, Plus, Loader2, ArrowRight, Trash2, Files, Paperclip } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Invoice, PaymentTerms, InvoiceStatus } from '../types';
import { calculateDueDate, auditInvoiceData, getSingaporeNowFormatted } from '../utils/dateUtils';
import { appendInvoiceToGoogleSheet } from '../utils/googleWorkspace';

interface DocumentExtractorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportInvoices: (newInvoices: Invoice[]) => void;
  currentUser: string;
}

interface ExtractedItem extends Partial<Invoice> {
  tempId: string;
  selected: boolean;
  sourceFileName?: string;
}

export const DocumentExtractorModal: React.FC<DocumentExtractorModalProps> = ({
  isOpen,
  onClose,
  onImportInvoices,
  currentUser
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload');
  const [pastedText, setPastedText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [extractedList, setExtractedList] = useState<ExtractedItem[]>([]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setSelectedFiles((prev) => [...prev, ...newFiles]);
      setErrorMessage(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files);
      setSelectedFiles((prev) => [...prev, ...newFiles]);
      setErrorMessage(null);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearFiles = () => {
    setSelectedFiles([]);
  };

  const processExtraction = async () => {
    setIsExtracting(true);
    setErrorMessage(null);

    try {
      let bodyData: any = {};

      if (activeTab === 'upload') {
        if (selectedFiles.length === 0) {
          setErrorMessage('Please select or drop one or multiple document/Excel files to extract.');
          setIsExtracting(false);
          return;
        }

        // Process all selected files into payloads
        const filePromises = selectedFiles.map(async (file) => {
          const isSpreadsheet = 
            file.name.endsWith('.xlsx') || 
            file.name.endsWith('.xls') || 
            file.name.endsWith('.csv') || 
            file.name.endsWith('.ods');

          if (isSpreadsheet) {
            try {
              const buffer = await file.arrayBuffer();
              const workbook = XLSX.read(buffer, { type: 'array' });
              let csvText = '';
              workbook.SheetNames.forEach((sheetName) => {
                const sheet = workbook.Sheets[sheetName];
                csvText += `--- Sheet: ${sheetName} ---\n` + XLSX.utils.sheet_to_csv(sheet) + '\n\n';
              });
              return {
                fileName: file.name,
                textContent: csvText
              };
            } catch (err) {
              console.warn(`XLSX client parse failed for ${file.name}, falling back:`, err);
            }
          }

          const isText = file.name.endsWith('.txt');
          if (isText) {
            const text = await file.text();
            return {
              fileName: file.name,
              textContent: text
            };
          }

          // For PDFs and images, read as base64
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const res = reader.result as string;
              const b64 = res.split(',')[1] || res;
              resolve(b64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          return {
            fileName: file.name,
            fileData: base64,
            fileType: file.type || 'application/octet-stream'
          };
        });

        const filesPayload = await Promise.all(filePromises);
        bodyData = { files: filesPayload };
      } else {
        if (!pastedText.trim()) {
          setErrorMessage('Please paste Excel spreadsheet rows or invoice text.');
          setIsExtracting(false);
          return;
        }
        bodyData = { textContent: pastedText };
      }

      const res = await fetch('/api/ai/extract-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        if (res.status === 429 || errJson.isQuotaExceeded) {
          throw new Error(errJson.error || 'Gemini API free-tier quota reached (limit: 20 requests/day). Please wait ~45 seconds before trying again, or enter invoice details manually.');
        }
        throw new Error(errJson.error || 'Failed to extract invoice data from documents.');
      }

      const data = await res.json();
      const rawInvoices = data.invoices || [];

      if (rawInvoices.length === 0) {
        setErrorMessage('No valid invoice records could be identified across the uploaded documents. Please check file content.');
      } else {
        const formatted: ExtractedItem[] = rawInvoices.map((inv: any, idx: number) => {
          const supplierName = inv.supplierName || '';
          const invoiceNumber = inv.invoiceNumber || '';
          const invoiceDate = inv.invoiceDate || '';
          const approvalDate = inv.approvalDate || invoiceDate || '';
          const amount = typeof inv.amount === 'number' ? inv.amount : parseFloat(inv.amount) || 0;
          const currency = inv.currency || 'SGD';
          const paymentTerms: PaymentTerms = (inv.paymentTerms as PaymentTerms) || 'Net 30';
          const fixedDueDate = inv.fixedDueDate || undefined;
          const bankDetails = inv.bankDetails || '';
          const poNumber = inv.poNumber || '';
          const poAmount = typeof inv.poAmount === 'number' ? inv.poAmount : amount;
          const grnNumber = inv.grnNumber || '';
          const grnVerified = inv.grnVerified !== false;

          return {
            tempId: `ext-${Date.now()}-${idx}`,
            selected: true,
            supplierName,
            invoiceNumber,
            invoiceDate,
            approvalDate,
            amount,
            currency,
            paymentTerms,
            fixedDueDate,
            bankDetails,
            poNumber,
            poAmount,
            grnNumber,
            grnVerified,
            contactEmail: inv.contactEmail || '',
            sourceFileName: inv.notes ? undefined : (selectedFiles.length > 0 ? `Batch Upload (${selectedFiles.length} files)` : 'Spreadsheet Paste'),
            notes: inv.notes || `Extracted batch import from ${selectedFiles.length > 0 ? selectedFiles.map(f => f.name).join(', ') : 'spreadsheet paste'}`
          };
        });

        setExtractedList(formatted);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Error occurred during AI document extraction.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleUpdateExtractedItem = (index: number, field: string, val: any) => {
    setExtractedList((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  const handleConfirmImport = async () => {
    const selectedItems = extractedList.filter((item) => item.selected);
    if (selectedItems.length === 0) return;

    setIsExtracting(true);
    setErrorMessage(null);

    const now = getSingaporeNowFormatted();
    const finalizedInvoices: Invoice[] = [];
    const feedbackMessages: string[] = [];

    for (let idx = 0; idx < selectedItems.length; idx++) {
      const item = selectedItems[idx];
      const sheetResult = await appendInvoiceToGoogleSheet(item);

      if (!sheetResult.success) {
        feedbackMessages.push(`Invoice ${item.invoiceNumber || 'Record'}: ${sheetResult.userMessage}`);
      } else {
        feedbackMessages.push(`Invoice ${item.invoiceNumber}: Invoice successfully added to Google Sheets.`);
      }

      const calcDue = calculateDueDate(item.invoiceDate, item.paymentTerms || 'Net 30', item.fixedDueDate);
      const audit = auditInvoiceData({
        supplierName: item.supplierName,
        invoiceNumber: item.invoiceNumber,
        invoiceDate: item.invoiceDate,
        approvalDate: item.approvalDate,
        amount: item.amount,
        paymentTerms: item.paymentTerms,
        fixedDueDate: item.fixedDueDate,
        bankDetails: item.bankDetails
      });
      const initialStatus: InvoiceStatus = 'Unpaid';

      finalizedInvoices.push({
        id: `inv-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 9)}`,
        supplierName: item.supplierName || 'Needs Review',
        invoiceNumber: item.invoiceNumber || 'Needs Review',
        invoiceDate: item.invoiceDate || '',
        approvalDate: item.approvalDate || item.invoiceDate || '',
        amount: item.amount || 0,
        currency: 'SGD',
        paymentTerms: item.paymentTerms || 'Net 30',
        fixedDueDate: item.fixedDueDate,
        calculatedDueDate: calcDue,
        status: initialStatus,
        bankDetails: item.bankDetails || '',
        poNumber: item.poNumber,
        poAmount: item.poAmount,
        grnNumber: item.grnNumber,
        grnVerified: item.grnVerified,
        threeWayMatchStatus: 'Matched',
        readyForPayment: true,
        contactEmail: item.contactEmail || '',
        notes: item.notes || 'Batch extracted import',
        needsReview: audit.needsReview,
        reviewReasons: audit.reviewReasons,
        reminders: [],
        history: [
          {
            id: `hist-ext-${Date.now()}-${idx}`,
            timestamp: now,
            user: currentUser,
            action: 'Document Extracted',
            details: `Invoice imported & sent to Google Sheets Payment_Complete. Status: ${sheetResult.userMessage}`,
            type: 'creation'
          }
        ]
      });
    }

    setIsExtracting(false);

    if (finalizedInvoices.length > 0) {
      onImportInvoices(finalizedInvoices);
    }

    if (feedbackMessages.length > 0) {
      alert(`Google Sheets Import Summary:\n\n` + feedbackMessages.join('\n'));
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden my-8">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-white">Batch Multi-Invoice Extractor</h3>
              <p className="text-xs text-slate-300">Upload and extract multiple invoices at once (PDFs, Excel, CSV, Images)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {extractedList.length === 0 ? (
            <>
              {/* Tabs */}
              <div className="flex border-b border-slate-200">
                <button
                  type="button"
                  onClick={() => { setActiveTab('upload'); setErrorMessage(null); }}
                  className={`pb-3 px-4 font-medium text-sm border-b-2 flex items-center space-x-2 ${
                    activeTab === 'upload'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Files className="w-4 h-4" />
                  <span>Batch Upload Multiple Files</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveTab('paste'); setErrorMessage(null); }}
                  className={`pb-3 px-4 font-medium text-sm border-b-2 flex items-center space-x-2 ${
                    activeTab === 'paste'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Paste Excel / Text Data</span>
                </button>
              </div>

              {/* Upload Tab */}
              {activeTab === 'upload' ? (
                <div className="space-y-4">
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl p-6 text-center bg-slate-50 hover:bg-indigo-50/30 transition-all cursor-pointer"
                  >
                    <input
                      type="file"
                      id="doc-file-input"
                      multiple
                      className="hidden"
                      accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.txt"
                      onChange={handleFileChange}
                    />
                    <label htmlFor="doc-file-input" className="cursor-pointer space-y-3 block">
                      <div className="w-12 h-12 bg-white rounded-full shadow-md flex items-center justify-center mx-auto text-indigo-600">
                        <Upload className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          Click to select multiple files or drag & drop here
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Upload multiple PDF invoices, scanned images (.png/.jpg), Excel workbooks (.xlsx), or CSV files simultaneously
                        </p>
                      </div>
                    </label>
                  </div>

                  {/* Queued Files List */}
                  {selectedFiles.length > 0 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                          <Paperclip className="w-4 h-4 text-indigo-600" />
                          <span>{selectedFiles.length} File{selectedFiles.length > 1 ? 's' : ''} Queued for Batch AI Extraction</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleClearFiles}
                          className="text-xs text-rose-600 hover:underline flex items-center space-x-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Clear All</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                        {selectedFiles.map((file, idx) => (
                          <div
                            key={`${file.name}-${idx}`}
                            className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg text-xs"
                          >
                            <div className="flex items-center space-x-2 truncate">
                              <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                              <span className="font-medium text-slate-800 truncate">{file.name}</span>
                              <span className="text-[10px] text-slate-400">
                                ({(file.size / 1024).toFixed(1)} KB)
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveFile(idx)}
                              className="text-slate-400 hover:text-rose-600 p-1"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Paste Tab */
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Paste Copied Excel Spreadsheet Rows or Invoice Text
                  </label>
                  <textarea
                    rows={6}
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Example: Singtel | INV-2026-801 | 2026-07-01 | SGD 4250.00 | Net 30 | DBS Bank 003-90281-1 | PO-2026-012 | GRN-2026-088"
                    className="w-full text-xs font-mono p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              )}

              {/* Error Alert */}
              {errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex flex-col space-y-2 text-xs text-red-700">
                  <div className="flex items-start space-x-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage(null);
                      setExtractedList([
                        {
                          tempId: `ext-${Date.now()}-0`,
                          selected: true,
                          supplierName: '',
                          invoiceNumber: '',
                          invoiceDate: new Date().toISOString().split('T')[0],
                          approvalDate: new Date().toISOString().split('T')[0],
                          amount: 0,
                          currency: 'SGD',
                          paymentTerms: 'Net 30',
                          bankDetails: '',
                          poNumber: '',
                          poAmount: 0,
                          grnNumber: '',
                          grnVerified: true,
                          contactEmail: '',
                          notes: 'Manual entry fallback',
                        },
                      ]);
                    }}
                    className="self-start px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1"
                  >
                    <span>+ Enter Invoice Details Manually</span>
                  </button>
                </div>
              )}

              {/* Action */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={isExtracting}
                  onClick={processExtraction}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium text-sm shadow-sm flex items-center space-x-2 disabled:opacity-50 transition-all"
                >
                  {isExtracting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Extracting {selectedFiles.length > 0 ? `${selectedFiles.length} Files` : 'Data'} with Gemini AI...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Extract All Invoices ({activeTab === 'upload' ? `${selectedFiles.length} File${selectedFiles.length === 1 ? '' : 's'}` : 'Pasted Text'})</span>
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            /* Extracted Results Table & Verification Workbench */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-slate-900 text-sm">Review & Verify Extracted Invoices ({extractedList.length} Found)</h4>
                  <p className="text-xs text-slate-500">Verify extracted details and Three-Way Match status before importing to ledger.</p>
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setExtractedList((prev) => [
                        ...prev,
                        {
                          tempId: `ext-${Date.now()}-${prev.length}`,
                          selected: true,
                          supplierName: '',
                          invoiceNumber: '',
                          invoiceDate: new Date().toISOString().split('T')[0],
                          approvalDate: new Date().toISOString().split('T')[0],
                          amount: 0,
                          currency: 'SGD',
                          paymentTerms: 'Net 30',
                          bankDetails: '',
                          poNumber: '',
                          poAmount: 0,
                          grnNumber: '',
                          grnVerified: true,
                          contactEmail: '',
                          notes: 'Manual row',
                        },
                      ]);
                    }}
                    className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold hover:underline"
                  >
                    + Add Row
                  </button>
                  <button
                    type="button"
                    onClick={() => setExtractedList([])}
                    className="text-xs text-indigo-600 hover:underline font-medium"
                  >
                    Extract Another Batch
                  </button>
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                {extractedList.map((item, index) => {
                  const audit = auditInvoiceData({
                    supplierName: item.supplierName,
                    invoiceNumber: item.invoiceNumber,
                    invoiceDate: item.invoiceDate,
                    approvalDate: item.approvalDate,
                    amount: item.amount,
                    paymentTerms: item.paymentTerms,
                    fixedDueDate: item.fixedDueDate,
                    bankDetails: item.bankDetails
                  });
                  return (
                    <div key={item.tempId} className="p-4 space-y-3 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={(e) => handleUpdateExtractedItem(index, 'selected', e.target.checked)}
                            className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                          />
                          <span className="font-semibold text-slate-900 text-xs">
                            {item.supplierName || 'Missing Supplier'}
                          </span>
                        </label>
                        <div className="flex items-center space-x-2">
                          {!audit.needsReview ? (
                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-800 rounded-full flex items-center space-x-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Complete Details</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-800 rounded-full flex items-center space-x-1">
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              <span>Incomplete / Review Needed</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Editable Form Inputs */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <label className="text-[10px] font-medium text-slate-500">Supplier Name</label>
                          <input
                            type="text"
                            value={item.supplierName || ''}
                            onChange={(e) => handleUpdateExtractedItem(index, 'supplierName', e.target.value)}
                            className="w-full p-1.5 border border-slate-300 rounded bg-white text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-medium text-slate-500">Invoice Number</label>
                          <input
                            type="text"
                            value={item.invoiceNumber || ''}
                            onChange={(e) => handleUpdateExtractedItem(index, 'invoiceNumber', e.target.value)}
                            className="w-full p-1.5 border border-slate-300 rounded bg-white text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-medium text-slate-500">Invoice Date</label>
                          <input
                            type="date"
                            value={item.invoiceDate || ''}
                            onChange={(e) => handleUpdateExtractedItem(index, 'invoiceDate', e.target.value)}
                            className="w-full p-1.5 border border-slate-300 rounded bg-white text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-medium text-slate-500">Amount (SGD)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={item.amount || 0}
                            onChange={(e) => handleUpdateExtractedItem(index, 'amount', parseFloat(e.target.value) || 0)}
                            className="w-full p-1.5 border border-slate-300 rounded bg-white text-xs font-semibold"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-medium text-slate-500">PO Number</label>
                          <input
                            type="text"
                            placeholder="e.g. PO-2026-101"
                            value={item.poNumber || ''}
                            onChange={(e) => handleUpdateExtractedItem(index, 'poNumber', e.target.value)}
                            className="w-full p-1.5 border border-slate-300 rounded bg-white text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-medium text-slate-500">Goods Receipt (GRN)</label>
                          <input
                            type="text"
                            placeholder="e.g. GRN-2026-50"
                            value={item.grnNumber || ''}
                            onChange={(e) => handleUpdateExtractedItem(index, 'grnNumber', e.target.value)}
                            className="w-full p-1.5 border border-slate-300 rounded bg-white text-xs"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] font-medium text-slate-500">Bank Details</label>
                          <input
                            type="text"
                            placeholder="Bank Name / Account Number"
                            value={item.bankDetails || ''}
                            onChange={(e) => handleUpdateExtractedItem(index, 'bankDetails', e.target.value)}
                            className="w-full p-1.5 border border-slate-300 rounded bg-white text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-slate-500">
                  {extractedList.filter((i) => i.selected).length} of {extractedList.length} records selected for import
                </span>
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setExtractedList([])}
                    className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-medium hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmImport}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-medium flex items-center space-x-2 shadow-sm"
                  >
                    <span>Import {extractedList.filter((i) => i.selected).length} Verified Invoices</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
