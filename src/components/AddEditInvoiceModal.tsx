import React, { useState, useEffect } from 'react';
import { Invoice, PaymentTerms } from '../types';
import { calculateDueDate, auditInvoiceData, formatSingaporeDate } from '../utils/dateUtils';
import { X, Sparkles, Calendar, DollarSign, Building2, CreditCard, AlertCircle, CheckCircle2 } from 'lucide-react';

interface AddEditInvoiceModalProps {
  isOpen: boolean;
  invoiceToEdit?: Invoice | null;
  onClose: () => void;
  onSave: (invoiceData: Partial<Invoice>) => void;
}

export const AddEditInvoiceModal: React.FC<AddEditInvoiceModalProps> = ({
  isOpen,
  invoiceToEdit,
  onClose,
  onSave,
}) => {
  const [supplierName, setSupplierName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [approvalDate, setApprovalDate] = useState('');
  const [amount, setAmount] = useState<string>('');
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>('Net 30');
  const [fixedDueDate, setFixedDueDate] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [bankDetails, setBankDetails] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [poAmount, setPoAmount] = useState<string>('');
  const [grnNumber, setGrnNumber] = useState('');
  const [grnVerified, setGrnVerified] = useState(true);
  const [notes, setNotes] = useState('');

  const [aiInspectionResult, setAiInspectionResult] = useState<string | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);

  useEffect(() => {
    if (invoiceToEdit) {
      setSupplierName(invoiceToEdit.supplierName || '');
      setInvoiceNumber(invoiceToEdit.invoiceNumber || '');
      setInvoiceDate(invoiceToEdit.invoiceDate || '');
      setApprovalDate(invoiceToEdit.approvalDate || '');
      setAmount(invoiceToEdit.amount ? String(invoiceToEdit.amount) : '');
      setPaymentTerms(invoiceToEdit.paymentTerms || 'Net 30');
      setFixedDueDate(invoiceToEdit.fixedDueDate || '');
      setContactEmail(invoiceToEdit.contactEmail || '');
      setBankDetails(invoiceToEdit.bankDetails || '');
      setPoNumber(invoiceToEdit.poNumber || '');
      setPoAmount(invoiceToEdit.poAmount !== undefined ? String(invoiceToEdit.poAmount) : (invoiceToEdit.amount ? String(invoiceToEdit.amount) : ''));
      setGrnNumber(invoiceToEdit.grnNumber || '');
      setGrnVerified(invoiceToEdit.grnVerified !== false);
      setNotes(invoiceToEdit.notes || '');
    } else {
      setSupplierName('');
      setInvoiceNumber('');
      setInvoiceDate('');
      setApprovalDate('');
      setAmount('');
      setPaymentTerms('Net 30');
      setFixedDueDate('');
      setContactEmail('');
      setBankDetails('');
      setPoNumber('');
      setPoAmount('');
      setGrnNumber('');
      setGrnVerified(true);
      setNotes('');
    }
    setAiInspectionResult(null);
  }, [invoiceToEdit, isOpen]);

  if (!isOpen) return null;

  const numericAmount = parseFloat(amount) || 0;

  // Calculate Due Date in real-time using application code
  const calculatedDue = calculateDueDate(invoiceDate, paymentTerms, fixedDueDate);
  const audit = auditInvoiceData({
    supplierName,
    invoiceNumber,
    invoiceDate,
    approvalDate,
    amount: numericAmount,
    paymentTerms,
    fixedDueDate,
    bankDetails,
  });

  const handleRunAIInspection = async () => {
    setIsInspecting(true);
    setAiInspectionResult(null);

    try {
      const res = await fetch('/api/ai/inspect-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierName,
          invoiceNumber,
          invoiceDate,
          approvalDate,
          amount: numericAmount,
          paymentTerms,
          fixedDueDate,
          bankDetails,
        }),
      });
      const data = await res.json();
      setAiInspectionResult(data.result || data.error || 'Inspection completed.');
    } catch (err: any) {
      setAiInspectionResult('Error running AI inspection: ' + err.message);
    } finally {
      setIsInspecting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const parsedPoAmount = poAmount ? parseFloat(poAmount) : numericAmount;

    onSave({
      supplierName,
      invoiceNumber,
      invoiceDate,
      approvalDate,
      amount: numericAmount,
      paymentTerms,
      fixedDueDate: paymentTerms === 'Fixed due date' ? fixedDueDate : undefined,
      contactEmail,
      bankDetails,
      poNumber: poNumber.trim() || undefined,
      poAmount: parsedPoAmount,
      grnNumber: grnNumber.trim() || undefined,
      grnVerified: grnVerified,
      notes,
      calculatedDueDate: calculatedDue,
      needsReview: audit.needsReview,
      reviewReasons: audit.reviewReasons,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-8">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">
              {invoiceToEdit ? 'Edit Supplier Invoice' : 'Add Approved Supplier Invoice'}
            </h2>
            <p className="text-xs text-slate-400">Due date will be automatically calculated in Singapore Time</p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          
          {/* Supplier Name & Invoice Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Supplier Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Singtel Enterprise Solutions"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  id="input-supplier-name"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Invoice Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. INV-2026-801"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                id="input-invoice-number"
              />
            </div>
          </div>

          {/* Invoice Date & Approval Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Invoice Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                id="input-invoice-date"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Approval Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={approvalDate}
                onChange={(e) => setApprovalDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                id="input-approval-date"
              />
            </div>
          </div>

          {/* Amount & Payment Terms */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Amount (SGD) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  id="input-invoice-amount"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Payment Terms <span className="text-rose-500">*</span>
              </label>
              <select
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value as PaymentTerms)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                id="select-payment-terms"
              >
                <option value="Due on receipt">Due on receipt (Invoice Date)</option>
                <option value="Net 7">Net 7 (+7 Days)</option>
                <option value="Net 14">Net 14 (+14 Days)</option>
                <option value="Net 30">Net 30 (+30 Days)</option>
                <option value="Net 45">Net 45 (+45 Days)</option>
                <option value="Net 60">Net 60 (+60 Days)</option>
                <option value="Fixed due date">Fixed due date (Custom)</option>
              </select>
            </div>
          </div>

          {/* Fixed Due Date if selected */}
          {paymentTerms === 'Fixed due date' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Specify Fixed Due Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={fixedDueDate}
                onChange={(e) => setFixedDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          )}

          {/* Live Automatic Due Date Preview Box */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-500 font-medium block">Automatic Calculated Due Date:</span>
              <span className="text-sm font-bold text-slate-900">
                {calculatedDue ? formatSingaporeDate(calculatedDue) : <span className="text-purple-600">Needs Review (Missing Date)</span>}
              </span>
            </div>
            {audit.needsReview && (
              <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-semibold text-[11px]">
                Incomplete Data
              </span>
            )}
          </div>

          {/* Three-Way Matching Section (PO & GRN) */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Three-Way Matching Controls
              </span>
              <span className="text-[11px] text-slate-500">
                Matches PO + Goods Receipt + Supplier Invoice
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Purchase Order (PO) Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. PO-2026-012"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Approved PO Amount (SGD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Matching Amount"
                  value={poAmount}
                  onChange={(e) => setPoAmount(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Goods Receipt Note (GRN) Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. GRN-2026-088"
                  value={grnNumber}
                  onChange={(e) => setGrnNumber(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-mono"
                />
              </div>

              <div className="flex items-center pt-5">
                <label className="flex items-center space-x-2 cursor-pointer text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={grnVerified}
                    onChange={(e) => setGrnVerified(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                  />
                  <span>Goods / Services Verified Received</span>
                </label>
              </div>
            </div>
          </div>

          {/* Supplier Email & Bank Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Supplier Email (for Reminders)
              </label>
              <input
                type="email"
                placeholder="accounts@supplier.com"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Verified Supplier Bank Details <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. DBS Bank - A/C 003-90281-1"
                value={bankDetails}
                onChange={(e) => setBankDetails(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Staff Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Staff Notes (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="Add PO numbers, department codes, or milestone descriptions..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* AI Inspection Box */}
          <div className="pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handleRunAIInspection}
                disabled={isInspecting}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center space-x-1.5 border border-slate-700"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>{isInspecting ? 'Inspecting Data...' : 'Ask AI Inspector to Audit Draft'}</span>
              </button>
            </div>

            {aiInspectionResult && (
              <div className="mt-2 p-3 bg-slate-900 text-slate-200 rounded-lg text-xs space-y-1 font-sans">
                <p className="font-semibold text-amber-400">AI Inspector Feedback:</p>
                <p className="whitespace-pre-wrap">{aiInspectionResult}</p>
              </div>
            )}
          </div>

          {/* Submit buttons */}
          <div className="pt-4 border-t border-slate-200 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-xs"
              id="btn-save-invoice"
            >
              {invoiceToEdit ? 'Save Changes' : 'Save Invoice'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
