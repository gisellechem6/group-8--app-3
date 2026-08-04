import React, { useState, useMemo } from 'react';
import { Invoice, FilterOptions, InvoiceStatus } from '../types';
import { formatSingaporeDate, getDaysUntilDue, getEligibleReminderStage, calculateThreeWayMatch } from '../utils/dateUtils';
import {
  Search,
  Clock,
  CheckCircle2,
  AlertCircle,
  Eye,
  Send,
  HelpCircle,
  PauseCircle,
  FileX,
  Plus,
  Sparkles,
  FileSpreadsheet,
  Layers,
  ArrowRight
} from 'lucide-react';

interface InvoiceListProps {
  invoices: Invoice[];
  allInvoices?: Invoice[];
  filters: FilterOptions;
  onFilterChange: (newFilters: Partial<FilterOptions>) => void;
  onSelectInvoice: (invoice: Invoice, initialTab?: 'details' | 'history' | 'reminders') => void;
  onOpenDraftReminder: (invoice: Invoice) => void;
  onQuickMarkPaid: (invoiceId: string) => void;
  onQuickHold: (invoiceId: string) => void;
  onOpenAddModal: () => void;
  onOpenExtractorModal: () => void;
  onLoadSampleData?: () => void;
}

export const InvoiceList: React.FC<InvoiceListProps> = ({
  invoices,
  allInvoices,
  filters,
  onFilterChange,
  onSelectInvoice,
  onOpenDraftReminder,
  onQuickMarkPaid,
  onQuickHold,
  onOpenAddModal,
  onOpenExtractorModal,
  onLoadSampleData,
}) => {
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  const uniqueSuppliers = useMemo(() => {
    const list = allInvoices || invoices;
    return Array.from(new Set(list.map((inv) => inv.supplierName))).filter(Boolean).sort();
  }, [allInvoices, invoices]);

  const formatSGD = (amount: number) => {
    return new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency: 'SGD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const renderStatusBadge = (status: InvoiceStatus, needsReview: boolean, calculatedDueDate?: string) => {
    if (needsReview) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-extrabold uppercase tracking-wider">
          <HelpCircle className="w-3 h-3 mr-1 text-amber-600" />
          <span>NEEDS REVIEW</span>
        </span>
      );
    }

    if (status === 'Paid') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-extrabold uppercase tracking-wider">
          <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
          <span>PAID</span>
        </span>
      );
    }

    if (status === 'On Hold') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-300 text-[10px] font-extrabold uppercase tracking-wider">
          <PauseCircle className="w-3 h-3 mr-1 text-purple-600" />
          <span>ON HOLD</span>
        </span>
      );
    }

    if (status === 'Disputed') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 text-[10px] font-extrabold uppercase tracking-wider">
          <AlertCircle className="w-3 h-3 mr-1 text-rose-600" />
          <span>DISPUTED</span>
        </span>
      );
    }

    if (status === 'Cancelled') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 border border-slate-300 text-[10px] font-bold uppercase tracking-wider">
          <FileX className="w-3 h-3 mr-1 text-slate-500" />
          <span>CANCELLED</span>
        </span>
      );
    }

    // For Unpaid status, calculate due date urgency status
    if (calculatedDueDate) {
      const daysLeft = getDaysUntilDue(calculatedDueDate);
      if (daysLeft !== null) {
        if (daysLeft < 0) {
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 text-[10px] font-extrabold uppercase tracking-wider">
              <AlertCircle className="w-3 h-3 mr-1 text-rose-600" />
              <span>OVERDUE ({Math.abs(daysLeft)}d)</span>
            </span>
          );
        }
        if (daysLeft === 0) {
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-extrabold uppercase tracking-wider">
              <Clock className="w-3 h-3 mr-1 text-amber-600" />
              <span>DUE TODAY</span>
            </span>
          );
        }
        if (daysLeft <= 7) {
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-900 border border-yellow-300 text-[10px] font-extrabold uppercase tracking-wider">
              <Clock className="w-3 h-3 mr-1 text-yellow-700" />
              <span>DUE SOON ({daysLeft}d)</span>
            </span>
          );
        }
      }
    }

    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300 text-[10px] font-bold uppercase tracking-wider">
        APPROVED
      </span>
    );
  };

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col overflow-hidden flex-1 min-h-0">
      
      {/* Table Header / Toolbar */}
      <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
        <div>
          <h2 className="font-bold text-slate-800 text-base">Invoice Ledger</h2>
          <p className="text-xs text-slate-500">Track approved invoices, three-way matching, and payment deadlines</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenExtractorModal}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
            id="btn-extract-document"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
            <span>Extract from Excel / Document</span>
          </button>

          <button
            onClick={onOpenAddModal}
            className="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-800 flex items-center gap-1 shadow-xs transition-colors"
            id="btn-ledger-add-invoice"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Invoice</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-3 bg-white border-b border-slate-200 space-y-2">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
          {/* Search Box */}
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search supplier, inv #, PO #, GRN #..."
              value={filters.search}
              onChange={(e) => onFilterChange({ search: e.target.value })}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              id="input-search-invoices"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Supplier Filter */}
            <select
              value={filters.supplier || 'ALL'}
              onChange={(e) => onFilterChange({ supplier: e.target.value })}
              className="px-2.5 py-1 rounded-md text-xs font-medium border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Filter by Supplier"
            >
              <option value="ALL">All Suppliers</option>
              {uniqueSuppliers.map((sup) => (
                <option key={sup} value={sup}>
                  {sup}
                </option>
              ))}
            </select>

            {/* Due Date Filter */}
            <select
              value={filters.dueCategory || 'all'}
              onChange={(e) => onFilterChange({ dueCategory: e.target.value })}
              className="px-2.5 py-1 rounded-md text-xs font-medium border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Filter by Due Date"
            >
              <option value="all">All Due Dates</option>
              <option value="due_within_7">Due Soon (Within 7 Days)</option>
              <option value="due_today">Due Today</option>
              <option value="overdue">Overdue</option>
            </select>

            {/* Payment Status Filter */}
            <select
              value={filters.status || 'ALL'}
              onChange={(e) => onFilterChange({ status: e.target.value })}
              className="px-2.5 py-1 rounded-md text-xs font-medium border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Filter by Payment Status"
            >
              <option value="ALL">All Statuses</option>
              <option value="Unpaid">Unpaid</option>
              <option value="Paid">Paid</option>
              <option value="On Hold">On Hold</option>
              <option value="Disputed">Disputed</option>
              <option value="Cancelled">Cancelled</option>
            </select>

            <button
              onClick={() => onFilterChange({ needsReviewOnly: !filters.needsReviewOnly })}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors whitespace-nowrap ${
                filters.needsReviewOnly
                  ? 'bg-purple-600 text-white border-purple-700 shadow-xs'
                  : 'bg-white text-purple-700 border-purple-200 hover:bg-purple-50'
              }`}
            >
              Needs Review Only
            </button>

            <div className="flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-200 text-xs">
              <button
                onClick={() => setViewMode('table')}
                className={`px-2 py-0.5 font-medium rounded ${
                  viewMode === 'table' ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'text-slate-500'
                }`}
              >
                Table
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`px-2 py-0.5 font-medium rounded ${
                  viewMode === 'cards' ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'text-slate-500'
                }`}
              >
                Cards
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Invoice Table View */}
      {viewMode === 'table' ? (
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 sticky top-0 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Inv #</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Due Date</th>
                <th className="px-4 py-3">Terms</th>
                <th className="px-4 py-3">3-Way Match</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-100">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 px-4">
                    <div className="max-w-md mx-auto space-y-3">
                      <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                        <FileSpreadsheet className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-800 text-sm">No Supplier Invoices Found</h3>
                        <p className="text-xs text-slate-500 mt-1">
                          This is a clean invoice monitor workspace. Add your first invoice manually, extract from an Excel spreadsheet, or load demo sample data.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                        <button
                          onClick={onOpenExtractorModal}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg flex items-center space-x-1"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>Extract Excel / Docs</span>
                        </button>
                        <button
                          onClick={onOpenAddModal}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg flex items-center space-x-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add Invoice</span>
                        </button>
                        {onLoadSampleData && (
                          <button
                            onClick={onLoadSampleData}
                            className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg"
                          >
                            Load Sample Demo Data
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => {
                  const eligibleStage = getEligibleReminderStage(inv);
                  const isOverdue = inv.status === 'Unpaid' && inv.calculatedDueDate && (getDaysUntilDue(inv.calculatedDueDate) ?? 0) < 0;
                  const isDueToday = inv.status === 'Unpaid' && inv.calculatedDueDate && (getDaysUntilDue(inv.calculatedDueDate) === 0);
                  const match = calculateThreeWayMatch(inv);

                  return (
                    <tr
                      key={inv.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        inv.needsReview ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {inv.supplierName}
                      </td>

                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {inv.invoiceNumber}
                      </td>

                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {inv.amount > 0 ? formatSGD(inv.amount) : <span className="text-slate-400">---</span>}
                      </td>

                      <td className={`px-4 py-3 font-medium text-xs ${
                        isOverdue ? 'text-red-600' : isDueToday ? 'text-amber-600' : 'text-slate-700'
                      }`}>
                        {formatSingaporeDate(inv.calculatedDueDate)}
                      </td>

                      <td className="px-4 py-3 text-xs text-slate-600">
                        {inv.paymentTerms}
                      </td>

                      {/* 3-Way Match Badge Column */}
                      <td className="px-4 py-3">
                        {match.readyForPayment ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 mr-1" />
                            <span>Matched</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                            <AlertCircle className="w-3 h-3 text-amber-600 mr-1" />
                            <span>{match.status}</span>
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {renderStatusBadge(inv.status, inv.needsReview, inv.calculatedDueDate)}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {eligibleStage && (
                            <button
                              onClick={() => onOpenDraftReminder(inv)}
                              className="text-amber-600 hover:text-amber-700 font-semibold text-xs flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded border border-amber-200"
                            >
                              <Send className="w-3 h-3" />
                              <span>Draft</span>
                            </button>
                          )}

                          {inv.status !== 'Paid' && (
                            <button
                              onClick={() => onQuickMarkPaid(inv.id)}
                              className="text-emerald-700 hover:text-emerald-800 font-semibold text-xs bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200"
                              title="Mark Invoice as Paid"
                            >
                              Mark Paid
                            </button>
                          )}

                          {inv.status !== 'On Hold' && inv.status !== 'Paid' && (
                            <button
                              onClick={() => onQuickHold(inv.id)}
                              className="text-slate-700 hover:text-slate-800 font-semibold text-xs bg-slate-100 px-2 py-0.5 rounded border border-slate-300"
                              title="Place Invoice On Hold"
                            >
                              Hold
                            </button>
                          )}

                          <button
                            onClick={() => onSelectInvoice(inv, 'reminders')}
                            className="text-purple-700 hover:text-purple-800 font-semibold text-xs bg-purple-50 px-2 py-0.5 rounded border border-purple-200"
                            title="View Reminder History"
                          >
                            History ({inv.reminders.length})
                          </button>

                          <button
                            onClick={() => onSelectInvoice(inv, 'details')}
                            className="text-blue-600 hover:text-blue-700 font-semibold text-xs px-2 py-0.5"
                          >
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Cards View */
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto">
          {invoices.length === 0 ? (
            <div className="col-span-2 text-center py-12 text-slate-500">
              <p className="font-semibold text-slate-700">No supplier invoices found.</p>
            </div>
          ) : (
            invoices.map((inv) => {
              const match = calculateThreeWayMatch(inv);
              return (
                <div
                  key={inv.id}
                  className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between space-y-3"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">{inv.supplierName}</h3>
                      <p className="text-xs font-mono text-slate-500">{inv.invoiceNumber}</p>
                    </div>
                    <div className="flex flex-col items-end space-y-1">
                      {renderStatusBadge(inv.status, inv.needsReview, inv.calculatedDueDate)}
                      {match.readyForPayment && (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                          3-Way Matched
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1 text-xs text-slate-600">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Amount:</span>
                      <span className="font-bold text-slate-900">{formatSGD(inv.amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Due Date:</span>
                      <span className="font-medium text-slate-800">{formatSingaporeDate(inv.calculatedDueDate)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Terms:</span>
                      <span>{inv.paymentTerms}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">3-Way Match:</span>
                      <span className={match.readyForPayment ? 'text-emerald-700 font-semibold' : 'text-amber-700'}>
                        {match.status}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-1.5 flex-wrap">
                    {inv.status !== 'Paid' && (
                      <button
                        onClick={() => onQuickMarkPaid(inv.id)}
                        className="text-emerald-700 font-semibold text-xs px-2 py-1 bg-emerald-50 rounded border border-emerald-200"
                      >
                        Mark Paid
                      </button>
                    )}
                    {inv.status !== 'On Hold' && inv.status !== 'Paid' && (
                      <button
                        onClick={() => onQuickHold(inv.id)}
                        className="text-slate-700 font-semibold text-xs px-2 py-1 bg-slate-100 rounded border border-slate-300"
                      >
                        Hold
                      </button>
                    )}
                    <button
                      onClick={() => onSelectInvoice(inv, 'reminders')}
                      className="text-purple-700 font-semibold text-xs px-2 py-1 bg-purple-50 rounded border border-purple-200"
                    >
                      History ({inv.reminders.length})
                    </button>
                    <button
                      onClick={() => onSelectInvoice(inv, 'details')}
                      className="text-blue-600 font-semibold text-xs px-2.5 py-1 bg-slate-50 rounded border border-slate-200"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Footer info */}
      <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex justify-between">
        <span>Showing {invoices.length} supplier invoices</span>
        <span>Dates calculated in Singapore Time (SGT)</span>
      </div>

    </section>
  );
};

