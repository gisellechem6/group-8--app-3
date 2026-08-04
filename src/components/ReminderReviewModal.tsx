import React, { useState, useEffect } from 'react';
import { Invoice, ReminderStage } from '../types';
import { formatSingaporeDate, getStageLabel } from '../utils/dateUtils';
import { X, Send, Sparkles, AlertCircle, CheckCircle2, Mail, Edit3 } from 'lucide-react';

interface ReminderReviewModalProps {
  invoice: Invoice | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmSend: (invoiceId: string, subject: string, body: string, recipientEmail: string, stage: ReminderStage) => void;
}

export const ReminderReviewModal: React.FC<ReminderReviewModalProps> = ({
  invoice,
  isOpen,
  onClose,
  onConfirmSend,
}) => {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [stage, setStage] = useState<ReminderStage>('3_days_before');

  const formatSGD = (amount: number) => {
    return new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency: 'SGD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  useEffect(() => {
    if (invoice && isOpen) {
      const formattedDueDate = formatSingaporeDate(invoice.calculatedDueDate);
      const formattedAmount = formatSGD(invoice.amount);
      const supplierEmail = invoice.contactEmail || `accounts@${invoice.supplierName.toLowerCase().replace(/[^a-z]/g, '')}.com`;
      
      setRecipientEmail(supplierEmail);

      const isMissingInfo =
        !invoice.supplierName ||
        !invoice.invoiceNumber ||
        invoice.amount === undefined ||
        invoice.amount === null ||
        !invoice.calculatedDueDate ||
        !invoice.status;

      if (isMissingInfo) {
        setSubject('Needs Review');
        setBody('Needs Review');
        return;
      }

      setSubject(`Payment Reminder: Invoice ${invoice.invoiceNumber} - ${invoice.supplierName}`);
      
      // Initial default short professional reminder under 100 words
      setBody(
        `Supplier: ${invoice.supplierName}\n` +
        `Invoice number: ${invoice.invoiceNumber}\n` +
        `Amount: ${formattedAmount}\n` +
        `Due date: ${formattedDueDate}\n` +
        `Payment status: ${invoice.status}\n\n` +
        `Action required: Finance staff should verify 3-way matching documents and confirm remittance before the payment deadline.\n\n` +
        `Best regards,\n` +
        `Finance Department`
      );

      // Auto-fetch AI refined draft
      fetchAIDraft(invoice, formattedDueDate, formattedAmount);
    }
  }, [invoice, isOpen]);

  const fetchAIDraft = async (inv: Invoice, formattedDueDate: string, formattedAmount: string) => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/ai/draft-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice: inv,
          stageLabel: getStageLabel(stage),
          formattedDueDate,
          formattedAmount,
        }),
      });
      const data = await res.json();
      if (data.subject) setSubject(data.subject);
      if (data.body) setBody(data.body);
    } catch (err) {
      console.error('Failed to fetch AI draft:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen || !invoice) return null;

  const handleSend = () => {
    if (!recipientEmail.trim() || !subject.trim() || !body.trim()) {
      alert('Please ensure all email fields are filled before sending.');
      return;
    }

    onConfirmSend(invoice.id, subject, body, recipientEmail, stage);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden my-8 animate-in fade-in duration-200">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-6 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Mail className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-lg font-bold text-white">Review & Send Payment Reminder</h2>
              <p className="text-xs text-slate-400">Staff verification required before email dispatch</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Staff Review Directive Warning */}
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 text-xs text-amber-900 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>Mandatory Staff Review:</strong> Please review and edit the draft below before confirming send.
          </span>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto text-xs">
          
          {/* Invoice Summary Pill */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <div className="flex justify-between font-semibold text-slate-900">
              <span>{invoice.supplierName} ({invoice.invoiceNumber})</span>
              <span>{formatSGD(invoice.amount)}</span>
            </div>
            <div className="flex justify-between text-slate-500 text-[11px]">
              <span>Payment Terms: {invoice.paymentTerms}</span>
              <span>Calculated Due: {formatSingaporeDate(invoice.calculatedDueDate)}</span>
            </div>
          </div>

          {/* Recipient Email */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Recipient Email <span className="text-rose-500">*</span>
            </label>
            <input
              type="email"
              required
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
              id="input-reminder-recipient"
            />
          </div>

          {/* Subject Line */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Email Subject Line <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
              id="input-reminder-subject"
            />
          </div>

          {/* Email Body */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-slate-700">
                Email Body Text (Editable) <span className="text-rose-500">*</span>
              </label>
              {isGenerating && (
                <span className="text-[11px] text-amber-600 flex items-center space-x-1">
                  <Sparkles className="w-3 h-3 animate-spin" />
                  <span>AI Drafting...</span>
                </span>
              )}
            </div>
            <textarea
              rows={8}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-sans text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500"
              id="textarea-reminder-body"
            />
          </div>

          <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-500">
            <strong>Verified Bank Details included in draft:</strong> {invoice.bankDetails}
          </div>

        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-200"
          >
            Cancel
          </button>

          <button
            onClick={handleSend}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs flex items-center space-x-1.5 shadow-xs"
            id="btn-confirm-send-reminder"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Confirm Staff Review & Send</span>
          </button>
        </div>

      </div>
    </div>
  );
};
