import React, { useState } from 'react';
import { Invoice, InvoiceStatus } from '../types';
import { formatSingaporeDate } from '../utils/dateUtils';
import { AlertTriangle, CheckCircle2, PauseCircle, HelpCircle, X, ShieldAlert } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  invoice: Invoice | null;
  targetStatus: InvoiceStatus | null;
  onClose: () => void;
  onConfirm: (invoiceId: string, targetStatus: InvoiceStatus, reason?: string) => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  invoice,
  targetStatus,
  onClose,
  onConfirm,
}) => {
  const [reason, setReason] = useState('');

  if (!isOpen || !invoice || !targetStatus) return null;

  const formatSGD = (amount: number) => {
    return new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency: 'SGD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const handleConfirm = () => {
    if (targetStatus === 'On Hold' && !reason.trim()) {
      alert('Please enter a brief reason for placing this invoice on hold.');
      return;
    }
    onConfirm(invoice.id, targetStatus, reason.trim() || undefined);
    setReason('');
    onClose();
  };

  const getStatusBadge = (status: InvoiceStatus) => {
    switch (status) {
      case 'Paid':
        return <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-300">PAID</span>;
      case 'On Hold':
        return <span className="px-2.5 py-1 rounded-full bg-purple-100 text-purple-800 text-xs font-bold border border-purple-300">ON HOLD</span>;
      case 'Disputed':
        return <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 text-xs font-bold border border-rose-300">DISPUTED</span>;
      case 'Cancelled':
        return <span className="px-2.5 py-1 rounded-full bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300">CANCELLED</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-bold border border-blue-300">UNPAID</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
        
        {/* Header */}
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {targetStatus === 'Paid' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : targetStatus === 'On Hold' ? (
              <PauseCircle className="w-5 h-5 text-purple-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            )}
            <div>
              <h3 className="font-bold text-base text-white">Confirm Invoice Status Change</h3>
              <p className="text-xs text-slate-400">Finance Staff Authorization</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-900">{invoice.supplierName}</span>
              <span className="font-mono text-slate-600 font-bold">{invoice.invoiceNumber}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Amount: <strong className="text-slate-900">{formatSGD(invoice.amount)}</strong></span>
              <span>Due: {formatSingaporeDate(invoice.calculatedDueDate)}</span>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex items-start space-x-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900">Confirmation Required</p>
              <p className="text-amber-800 mt-0.5">
                Are you sure you want to change the status of this invoice from{' '}
                <strong className="text-slate-900">{invoice.status}</strong> to{' '}
                <strong className="text-slate-900">{targetStatus}</strong>?
              </p>
            </div>
          </div>

          <div className="flex items-center justify-center space-x-3 py-2">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Current Status</span>
              {getStatusBadge(invoice.status)}
            </div>
            <span className="text-slate-400 font-bold text-lg">→</span>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">New Status</span>
              {getStatusBadge(targetStatus)}
            </div>
          </div>

          {(targetStatus === 'On Hold' || targetStatus === 'Disputed') && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason for {targetStatus} <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={`Enter specific reason for putting invoice on ${targetStatus.toLowerCase()}...`}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900"
                rows={2}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className={`px-4 py-2 text-xs font-semibold text-white rounded-lg shadow-xs transition-colors ${
              targetStatus === 'Paid'
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : targetStatus === 'On Hold'
                ? 'bg-purple-600 hover:bg-purple-700'
                : 'bg-slate-900 hover:bg-slate-800'
            }`}
          >
            Confirm {targetStatus}
          </button>
        </div>
      </div>
    </div>
  );
};
