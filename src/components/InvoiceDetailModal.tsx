import React, { useState, useEffect } from 'react';
import { Invoice, InvoiceStatus } from '../types';
import { formatSingaporeDate, getDaysUntilDue, getEligibleReminderStage, getStageLabel, calculateThreeWayMatch } from '../utils/dateUtils';
import {
  X,
  CheckCircle2,
  PauseCircle,
  AlertCircle,
  FileX,
  Send,
  Building2,
  CreditCard,
  Calendar,
  DollarSign,
  Clock,
  History,
  ShieldAlert,
  Sparkles,
  Edit3,
  HelpCircle,
  Mail,
  FileText
} from 'lucide-react';

interface InvoiceDetailModalProps {
  invoice: Invoice | null;
  onClose: () => void;
  onStatusChange: (invoiceId: string, newStatus: InvoiceStatus, reason?: string) => void;
  onOpenDraftReminder: (invoice: Invoice) => void;
  onEditInvoice: (invoice: Invoice) => void;
  onInspectAI: (invoice: Invoice) => void;
  initialTab?: 'details' | 'history' | 'reminders';
}

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({
  invoice,
  onClose,
  onStatusChange,
  onOpenDraftReminder,
  onEditInvoice,
  onInspectAI,
  initialTab,
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'history' | 'reminders'>(initialTab || 'details');
  const [holdReason, setHoldReason] = useState<string>('');
  const [showHoldPrompt, setShowHoldPrompt] = useState<boolean>(false);

  useEffect(() => {
    if (invoice) {
      setActiveTab(initialTab || 'details');
    }
  }, [invoice, initialTab]);

  if (!invoice) return null;

  const formatSGD = (amount: number) => {
    return new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency: 'SGD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const handleApplyHold = () => {
    if (!holdReason.trim()) {
      alert('Please enter a brief reason for putting this invoice on hold.');
      return;
    }
    if (!window.confirm('Are you sure you want to put this invoice On Hold?')) {
      return;
    }
    onStatusChange(invoice.id, 'On Hold', holdReason);
    setShowHoldPrompt(false);
    setHoldReason('');
  };

  const eligibleStage = getEligibleReminderStage(invoice);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden my-8 animate-in fade-in duration-200">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-6 flex items-start justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-emerald-400 font-semibold uppercase border border-slate-700">
                {invoice.invoiceNumber}
              </span>
              <span className="text-xs text-slate-400">Singapore Time (SGT)</span>
            </div>
            <h2 className="text-xl font-bold mt-1 text-white">{invoice.supplierName}</h2>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Safeguard Banner */}
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 text-xs text-amber-900 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Staff Control Directive:</strong> AI must not approve invoices, process payments, or change bank details. Staff must review all reminders.
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-200 bg-slate-50 px-6 flex space-x-6 text-sm">
          <button
            onClick={() => setActiveTab('details')}
            className={`py-3 font-medium border-b-2 transition-colors ${
              activeTab === 'details'
                ? 'border-emerald-600 text-emerald-700 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Invoice Overview
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`py-3 font-medium border-b-2 transition-colors flex items-center space-x-1.5 ${
              activeTab === 'history'
                ? 'border-emerald-600 text-emerald-700 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Audit Trail ({invoice.history.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('reminders')}
            className={`py-3 font-medium border-b-2 transition-colors flex items-center space-x-1.5 ${
              activeTab === 'reminders'
                ? 'border-emerald-600 text-emerald-700 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Mail className="w-4 h-4" />
            <span>Reminders ({invoice.reminders.length})</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
          
          {activeTab === 'details' && (
            <div className="space-y-6">
              
              {/* Needs Review Alert if applicable */}
              {invoice.needsReview && (
                <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 space-y-2">
                  <div className="flex items-center space-x-2 font-bold text-sm text-purple-800">
                    <HelpCircle className="w-4 h-4 text-purple-600" />
                    <span>Information Needs Review</span>
                  </div>
                  <p className="text-xs text-purple-700">
                    This invoice contains missing or unverified fields. Please review and update details manually.
                  </p>
                  <ul className="list-disc list-inside text-xs font-medium text-purple-800 space-y-0.5 pl-1">
                    {invoice.reviewReasons.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Main Key Info Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Total Amount</span>
                  <div className="text-2xl font-bold text-slate-900 mt-1">
                    {invoice.amount > 0 ? formatSGD(invoice.amount) : <span className="text-purple-700 text-base">Needs Review</span>}
                  </div>
                </div>

                <div>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Current Status</span>
                  <div className="mt-1 flex items-center space-x-2">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-900 text-white border border-slate-800">
                      {invoice.status}
                    </span>
                    {invoice.needsReview && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
                        Needs Review
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200">
                  <span className="text-xs font-medium text-slate-500">Invoice Date:</span>
                  <p className="text-sm font-semibold text-slate-800">{formatSingaporeDate(invoice.invoiceDate)}</p>
                </div>

                <div className="pt-2 border-t border-slate-200">
                  <span className="text-xs font-medium text-slate-500">Approval Date:</span>
                  <p className="text-sm font-semibold text-slate-800">{formatSingaporeDate(invoice.approvalDate)}</p>
                </div>

                <div className="pt-2 border-t border-slate-200">
                  <span className="text-xs font-medium text-slate-500">Payment Terms:</span>
                  <p className="text-sm font-semibold text-slate-800">{invoice.paymentTerms}</p>
                </div>

                <div className="pt-2 border-t border-slate-200">
                  <span className="text-xs font-medium text-slate-500">Calculated Due Date:</span>
                  <p className="text-sm font-bold text-slate-900">{formatSingaporeDate(invoice.calculatedDueDate)}</p>
                </div>
              </div>

              {/* Three-Way Matching Verification Card */}
              {(() => {
                const match = calculateThreeWayMatch(invoice);
                return (
                  <div className={`p-4 rounded-xl border space-y-3 ${
                    match.readyForPayment
                      ? 'bg-emerald-50/80 border-emerald-300 text-emerald-900'
                      : 'bg-amber-50/80 border-amber-300 text-amber-900'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 font-bold text-sm">
                        <FileText className={`w-4 h-4 ${match.readyForPayment ? 'text-emerald-600' : 'text-amber-600'}`} />
                        <span>Three-Way Matching Status</span>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        match.readyForPayment
                          ? 'bg-emerald-600 text-white'
                          : 'bg-amber-600 text-white'
                      }`}>
                        {match.readyForPayment ? 'Ready for Payment (Matched)' : match.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-white/80 p-3 rounded-lg border border-slate-200">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Purchase Order</span>
                        <span className="font-mono font-semibold text-slate-800">
                          {invoice.poNumber || <span className="text-amber-600 italic">No PO Recorded</span>}
                        </span>
                        {invoice.poAmount !== undefined && (
                          <span className="block text-[11px] text-slate-500">PO Amt: {formatSGD(invoice.poAmount)}</span>
                        )}
                      </div>

                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Goods Receipt (GRN)</span>
                        <span className="font-mono font-semibold text-slate-800">
                          {invoice.grnNumber || <span className="text-amber-600 italic">No GRN Recorded</span>}
                        </span>
                        <span className="block text-[11px] text-slate-500">
                          Status: {invoice.grnVerified ? 'Goods Verified' : 'Unverified'}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Amount Comparison</span>
                        <span className="font-semibold text-slate-800">
                          Inv: {formatSGD(invoice.amount)}
                        </span>
                        {invoice.poAmount !== undefined && (
                          <span className={`block text-[11px] font-bold ${
                            invoice.amount === invoice.poAmount ? 'text-emerald-600' : 'text-rose-600'
                          }`}>
                            {invoice.amount === invoice.poAmount ? '✓ Exact Match' : `Diff: ${formatSGD(invoice.amount - invoice.poAmount)}`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Verified Bank Details */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                <div className="flex items-center space-x-2 font-bold text-slate-800 text-sm">
                  <CreditCard className="w-4 h-4 text-emerald-600" />
                  <span>Verified Supplier Bank Details</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg text-xs font-mono text-slate-800 border border-slate-200">
                  {invoice.bankDetails || 'Needs Review - No bank details recorded.'}
                </div>
                <p className="text-[11px] text-slate-500 italic">
                  Note: AI Assistant is restricted from altering bank details. Any changes must be made by authorized staff.
                </p>
              </div>

              {/* Notes & Contacts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="font-semibold text-slate-700 block mb-1">Supplier Contact Email</span>
                  <span className="text-slate-800 font-medium">{invoice.contactEmail || 'None provided'}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="font-semibold text-slate-700 block mb-1">Staff Notes</span>
                  <span className="text-slate-800">{invoice.notes || 'No notes added.'}</span>
                </div>
              </div>

            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-800">Complete Audit Trail</h3>
              <div className="relative border-l-2 border-slate-200 pl-4 space-y-4 ml-2">
                {invoice.history.map((hist) => (
                  <div key={hist.id} className="relative group">
                    <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-emerald-600 border-2 border-white" />
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                      <div className="flex items-center justify-between text-slate-500 mb-1">
                        <span className="font-semibold text-slate-800">{hist.action}</span>
                        <span>{hist.timestamp}</span>
                      </div>
                      <p className="text-slate-700">{hist.details}</p>
                      <span className="text-[10px] text-slate-400 mt-1 block">Logged by: {hist.user}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'reminders' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800">Payment Reminder History</h3>
                {eligibleStage && (
                  <button
                    onClick={() => onOpenDraftReminder(invoice)}
                    className="px-3 py-1.5 bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 rounded-lg text-xs font-semibold flex items-center space-x-1"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Draft New Reminder</span>
                  </button>
                )}
              </div>

              {invoice.reminders.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-xs text-slate-500">
                  No payment reminders have been sent yet for this invoice.
                </div>
              ) : (
                <div className="space-y-3">
                  {invoice.reminders.map((rem) => (
                    <div key={rem.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{rem.subject}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          rem.status === 'Sent' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {rem.status}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white rounded border border-slate-200 font-mono text-slate-700 whitespace-pre-wrap">
                        {rem.body}
                      </div>
                      <div className="flex items-center justify-between text-slate-400 text-[11px]">
                        <span>Recipient: {rem.recipientEmail}</span>
                        <span>{rem.sentAt || rem.dateCreated} by {rem.sentBy || 'Staff'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Hold Reason Modal Overlay inside detail */}
        {showHoldPrompt && (
          <div className="p-4 bg-amber-50 border-t border-amber-200 space-y-3">
            <h4 className="text-xs font-bold text-amber-900">Enter Reason for Placing Invoice On Hold:</h4>
            <input
              type="text"
              placeholder="e.g. Awaiting revised SLA metrics or pending manager clarification..."
              value={holdReason}
              onChange={(e) => setHoldReason(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-white border border-amber-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowHoldPrompt(false)}
                className="px-3 py-1 bg-white border border-slate-300 text-slate-700 rounded text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyHold}
                className="px-3 py-1 bg-amber-600 text-white font-semibold rounded text-xs"
              >
                Confirm Hold
              </button>
            </div>
          </div>
        )}

        {/* Staff Action Toolbar */}
        <div className="bg-slate-100 p-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => onInspectAI(invoice)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center space-x-1.5 border border-slate-700"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Ask AI Inspector Check</span>
            </button>

            <button
              onClick={() => onEditInvoice(invoice)}
              className="px-3 py-2 bg-white hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg text-xs font-medium flex items-center space-x-1.5"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Details</span>
            </button>
          </div>

          {/* Status Change Buttons for Staff */}
          <div className="flex items-center space-x-2">
            {invoice.status !== 'Paid' && (
              <button
                onClick={() => {
                  if (window.confirm('Are you sure you want to mark this invoice as Paid?')) {
                    onStatusChange(invoice.id, 'Paid');
                  }
                }}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center space-x-1 shadow-xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Mark Paid</span>
              </button>
            )}

            {invoice.status !== 'On Hold' && invoice.status !== 'Paid' && (
              <button
                onClick={() => setShowHoldPrompt(true)}
                className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold flex items-center space-x-1"
              >
                <PauseCircle className="w-3.5 h-3.5" />
                <span>Put On Hold</span>
              </button>
            )}

            {invoice.status !== 'Disputed' && invoice.status !== 'Paid' && (
              <button
                onClick={() => {
                  if (window.confirm('Are you sure you want to change this invoice status to Disputed?')) {
                    onStatusChange(invoice.id, 'Disputed');
                  }
                }}
                className="px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold flex items-center space-x-1"
              >
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Dispute</span>
              </button>
            )}

            {invoice.status !== 'Unpaid' && (
              <button
                onClick={() => {
                  if (window.confirm('Are you sure you want to re-open this invoice as Unpaid?')) {
                    onStatusChange(invoice.id, 'Unpaid');
                  }
                }}
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-medium"
              >
                Re-open as Unpaid
              </button>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};
