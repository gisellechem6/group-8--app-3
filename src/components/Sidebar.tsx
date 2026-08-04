import React, { useState } from 'react';
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  PauseCircle,
  HelpCircle,
  ShieldCheck,
  Plus,
  Files,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Filter,
  DollarSign,
  FileCheck,
  RotateCcw,
  LayoutDashboard,
  Upload,
  PieChart,
  FileX
} from 'lucide-react';
import { InvoiceStatus } from '../types';

export interface StatusCounts {
  all: number;
  unpaid: number;
  readyForPayment: number;
  paid: number;
  onHold: number;
  disputed: number;
  cancelled: number;
  needsReview: number;
  dueWithin7: number;
  dueToday: number;
  overdue: number;
  totalUnpaidAmount: number;
  readyForPaymentAmount: number;
  paidAmount: number;
  onHoldAmount: number;
  disputedAmount: number;
  cancelledAmount: number;
}

interface SidebarProps {
  activeView: 'dashboard' | 'ledger';
  onSelectView: (view: 'dashboard' | 'ledger') => void;
  currentStatus: string;
  currentDueCategory: string;
  needsReviewOnly: boolean;
  statusCounts: StatusCounts;
  onSelectFilter: (type: 'status' | 'dueCategory' | 'needsReview', val: string) => void;
  onOpenAddModal: () => void;
  onOpenExtractorModal: () => void;
  onOpenAIAssistant: () => void;
  onLoadSampleData: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onSelectView,
  currentStatus,
  currentDueCategory,
  needsReviewOnly,
  statusCounts,
  onSelectFilter,
  onOpenAddModal,
  onOpenExtractorModal,
  onOpenAIAssistant,
  onLoadSampleData,
  isCollapsed,
  onToggleCollapse,
}) => {
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const formatSGD = (amount: number) => {
    return new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency: 'SGD',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const isSelected = (type: 'status' | 'dueCategory' | 'needsReview', val: string) => {
    if (activeView !== 'ledger') return false;
    if (type === 'needsReview') return needsReviewOnly;
    if (type === 'status') return currentStatus === val && !needsReviewOnly && currentDueCategory === 'all';
    if (type === 'dueCategory') return currentDueCategory === val && !needsReviewOnly;
    return false;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    onOpenExtractorModal();
  };

  return (
    <aside
      className={`bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 transition-all duration-300 z-20 shrink-0 ${
        isCollapsed ? 'w-16' : 'w-72'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800 shrink-0">
        {!isCollapsed && (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold shadow-sm">
              <FileCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-wide text-white leading-tight">
                Payment<span className="text-blue-400">Monitor</span>
              </h1>
              <p className="text-[10px] text-slate-400">Finance & Invoice Hub</p>
            </div>
          </div>
        )}

        {isCollapsed && (
          <div className="mx-auto w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
            <FileCheck className="w-5 h-5 text-white" />
          </div>
        )}

        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors hidden sm:block"
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Upload Invoices Section in Sidebar */}
      <div className="p-3 border-b border-slate-800 space-y-2 shrink-0">
        {!isCollapsed ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={onOpenExtractorModal}
            className={`p-3 rounded-xl border-2 border-dashed cursor-pointer transition-all flex flex-col items-center justify-center text-center ${
              isDraggingOver
                ? 'bg-indigo-900/50 border-indigo-400 text-white scale-[0.98]'
                : 'bg-slate-800/60 border-slate-700/80 hover:bg-slate-800 hover:border-slate-600 text-slate-300'
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center mb-1.5">
              <Upload className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-white block">Upload Invoices</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Drag & drop PDF, images or Excel</span>
            <span className="mt-2 text-[9px] font-bold uppercase tracking-wider text-indigo-300 px-2 py-0.5 bg-indigo-950 rounded border border-indigo-800">
              AI Data Extractor
            </span>
          </div>
        ) : (
          <button
            onClick={onOpenExtractorModal}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl flex items-center justify-center transition-all"
            title="Upload Invoices / Extractor"
          >
            <Upload className="w-4 h-4 text-white" />
          </button>
        )}

        <button
          onClick={onOpenAddModal}
          className={`w-full py-2 px-3 bg-slate-800/90 hover:bg-slate-800 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all border border-slate-700/60 ${
            isCollapsed ? 'justify-center' : 'justify-start'
          }`}
          title="Add Single Invoice Entry"
        >
          <Plus className="w-4 h-4 text-slate-400 shrink-0" />
          {!isCollapsed && <span>Manual Invoice Entry</span>}
        </button>
      </div>

      {/* Navigation Menu with In-Depth Status Information */}
      <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-5">
        
        {/* Main View: Home Dashboard */}
        <div className="space-y-1">
          <button
            onClick={() => onSelectView('dashboard')}
            className={`w-full px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition-colors ${
              activeView === 'dashboard'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 shrink-0 text-blue-300" />
            {!isCollapsed && <span>Home Status Overview</span>}
          </button>
        </div>

        {/* Section 1: Invoice Status Ledger */}
        <div className="space-y-1 pt-2 border-t border-slate-800/80">
          {!isCollapsed && (
            <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Status Ledger</span>
              <PieChart className="w-3 h-3 text-slate-400" />
            </div>
          )}

          {/* All Invoices */}
          <button
            onClick={() => {
              onSelectView('ledger');
              onSelectFilter('status', 'ALL');
            }}
            className={`w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
              isSelected('status', 'ALL')
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <FileText className="w-4 h-4 shrink-0 text-slate-400" />
              {!isCollapsed && <span className="truncate">All Invoices</span>}
            </div>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                isSelected('status', 'ALL') ? 'bg-blue-800 text-white' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {statusCounts.all}
            </span>
          </button>

          {/* Unpaid */}
          <button
            onClick={() => {
              onSelectView('ledger');
              onSelectFilter('status', 'Unpaid');
            }}
            className={`w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
              isSelected('status', 'Unpaid')
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Clock className="w-4 h-4 shrink-0 text-blue-400" />
              {!isCollapsed && <span className="truncate">Unpaid Invoices</span>}
            </div>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                isSelected('status', 'Unpaid') ? 'bg-blue-800 text-white' : 'bg-blue-950 text-blue-300 border border-blue-800/50'
              }`}
            >
              {statusCounts.unpaid}
            </span>
          </button>

          {/* Ready for Payment */}
          <button
            onClick={() => {
              onSelectView('ledger');
              onSelectFilter('status', 'ReadyForPayment');
            }}
            className={`w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
              isSelected('status', 'ReadyForPayment')
                ? 'bg-emerald-600 text-white font-semibold'
                : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              {!isCollapsed && <span className="truncate">Ready for Payment</span>}
            </div>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                isSelected('status', 'ReadyForPayment')
                  ? 'bg-emerald-800 text-white'
                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800/50'
              }`}
            >
              {statusCounts.readyForPayment}
            </span>
          </button>

          {/* Paid */}
          <button
            onClick={() => {
              onSelectView('ledger');
              onSelectFilter('status', 'Paid');
            }}
            className={`w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
              isSelected('status', 'Paid')
                ? 'bg-slate-700 text-white font-semibold'
                : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-slate-400" />
              {!isCollapsed && <span className="truncate">Paid / Settled</span>}
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300">
              {statusCounts.paid}
            </span>
          </button>

          {/* On Hold */}
          <button
            onClick={() => {
              onSelectView('ledger');
              onSelectFilter('status', 'On Hold');
            }}
            className={`w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
              isSelected('status', 'On Hold')
                ? 'bg-amber-600 text-white font-semibold'
                : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <PauseCircle className="w-4 h-4 shrink-0 text-amber-400" />
              {!isCollapsed && <span className="truncate">On Hold</span>}
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800/60">
              {statusCounts.onHold}
            </span>
          </button>

          {/* Disputed */}
          <button
            onClick={() => {
              onSelectView('ledger');
              onSelectFilter('status', 'Disputed');
            }}
            className={`w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
              isSelected('status', 'Disputed')
                ? 'bg-rose-600 text-white font-semibold'
                : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <HelpCircle className="w-4 h-4 shrink-0 text-rose-400" />
              {!isCollapsed && <span className="truncate">Disputed</span>}
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800/60">
              {statusCounts.disputed}
            </span>
          </button>

          {/* Cancelled */}
          <button
            onClick={() => {
              onSelectView('ledger');
              onSelectFilter('status', 'Cancelled');
            }}
            className={`w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
              isSelected('status', 'Cancelled')
                ? 'bg-slate-700 text-white font-semibold'
                : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <FileX className="w-4 h-4 shrink-0 text-slate-400" />
              {!isCollapsed && <span className="truncate">Cancelled</span>}
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400">
              {statusCounts.cancelled}
            </span>
          </button>

          {/* Needs Review */}
          <button
            onClick={() => {
              onSelectView('ledger');
              onSelectFilter('needsReview', 'true');
            }}
            className={`w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors border border-dashed ${
              isSelected('needsReview', 'true')
                ? 'bg-purple-600 text-white border-purple-400 font-semibold'
                : 'border-purple-800/50 text-purple-300 hover:bg-purple-950/40'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertTriangle className="w-4 h-4 shrink-0 text-purple-400" />
              {!isCollapsed && <span className="truncate">Needs Review</span>}
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-950 text-purple-200 border border-purple-700">
              {statusCounts.needsReview}
            </span>
          </button>
        </div>

        {/* Section 2: Due Date Timeline */}
        <div className="space-y-1 pt-2 border-t border-slate-800">
          {!isCollapsed && (
            <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Due Date Timeline
            </div>
          )}

          {/* Due Within 7 Days */}
          <button
            onClick={() => {
              onSelectView('ledger');
              onSelectFilter('dueCategory', 'due_within_7');
            }}
            className={`w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
              isSelected('dueCategory', 'due_within_7')
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Clock className="w-4 h-4 shrink-0 text-blue-400" />
              {!isCollapsed && <span className="truncate">Due Within 7 Days</span>}
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-blue-300">
              {statusCounts.dueWithin7}
            </span>
          </button>

          {/* Due Today */}
          <button
            onClick={() => {
              onSelectView('ledger');
              onSelectFilter('dueCategory', 'due_today');
            }}
            className={`w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
              isSelected('dueCategory', 'due_today')
                ? 'bg-amber-600 text-white font-semibold'
                : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              {!isCollapsed && <span className="truncate">Due Today</span>}
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800/60">
              {statusCounts.dueToday}
            </span>
          </button>

          {/* Overdue */}
          <button
            onClick={() => {
              onSelectView('ledger');
              onSelectFilter('dueCategory', 'overdue');
            }}
            className={`w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
              isSelected('dueCategory', 'overdue')
                ? 'bg-rose-600 text-white font-semibold'
                : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              {!isCollapsed && <span className="truncate">Overdue Invoices</span>}
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950 text-rose-200 border border-rose-800">
              {statusCounts.overdue}
            </span>
          </button>
        </div>

        {/* Section 3: AI Assistant Launcher */}
        <div className="pt-2 border-t border-slate-800">
          <button
            onClick={onOpenAIAssistant}
            className={`w-full p-2.5 bg-slate-800/90 hover:bg-slate-800 border border-slate-700/80 text-amber-300 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition-all ${
              isCollapsed ? 'justify-center' : 'justify-start'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            {!isCollapsed && (
              <div className="text-left">
                <span className="block text-slate-200 text-xs font-bold">AI Assistant</span>
                <span className="block text-[10px] text-slate-400 font-normal">Check rules & draft reminders</span>
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Footer / Reset Data */}
      <div className="p-3 border-t border-slate-800 shrink-0">
        <button
          onClick={onLoadSampleData}
          className={`w-full py-1.5 px-2 text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1.5 hover:bg-slate-800/50 rounded-lg transition-colors ${
            isCollapsed ? 'justify-center' : 'justify-start'
          }`}
          title="Reload Demo Datasets"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {!isCollapsed && <span>Load Demo Invoices</span>}
        </button>
      </div>
    </aside>
  );
};


