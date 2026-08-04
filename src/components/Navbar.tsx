import React, { useState, useEffect } from 'react';
import { ShieldCheck, Plus, Sparkles, Clock, AlertTriangle, FileText, CheckCircle2 } from 'lucide-react';
import { getSingaporeNowFormatted } from '../utils/dateUtils';

interface NavbarProps {
  onOpenAddModal: () => void;
  onOpenExtractorModal: () => void;
  onOpenAIAssistant: () => void;
  unpaidCount: number;
  overdueCount: number;
  needsReviewCount: number;
  activeFilterTitle?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenAddModal,
  onOpenExtractorModal,
  onOpenAIAssistant,
  unpaidCount,
  overdueCount,
  needsReviewCount,
  activeFilterTitle = 'All Invoices'
}) => {
  const [sgtTime, setSgtTime] = useState<string>('');

  useEffect(() => {
    setSgtTime(getSingaporeNowFormatted());
    const interval = setInterval(() => {
      setSgtTime(getSingaporeNowFormatted());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-14 bg-white border-b border-slate-200 text-slate-900 sticky top-0 z-10 shadow-2xs flex items-center justify-between px-4 sm:px-6 shrink-0">
      
      {/* Left: Section Title / Breadcrumb */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-slate-400">Payment Monitoring</span>
        <span className="text-slate-300 text-xs">/</span>
        <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <span>{activeFilterTitle}</span>
        </h2>
      </div>

      {/* Center: Singapore Time Clock & Status Alerts */}
      <div className="hidden md:flex items-center gap-3 text-xs font-medium text-slate-500">
        <div className="flex items-center gap-2 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="font-mono text-slate-700 font-semibold text-[11px]">{sgtTime || 'SGT Time'}</span>
          <span className="text-[10px] text-slate-400 font-semibold uppercase">SGT (GMT+8)</span>
        </div>

        {overdueCount > 0 ? (
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-red-50 text-red-700 rounded-md border border-red-200 text-[11px] font-semibold">
            <AlertTriangle className="w-3 h-3" />
            <span>{overdueCount} Overdue</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-emerald-600 text-[11px] font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Verified Ledger</span>
          </div>
        )}

        {needsReviewCount > 0 && (
          <div className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-md text-[11px] font-semibold">
            {needsReviewCount} Needs Review
          </div>
        )}
      </div>

      {/* Right: Actions & User Info */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenAIAssistant}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold border border-slate-200 transition-colors shadow-2xs"
          title="Open AI Invoice Assistant"
          id="btn-ai-assistant"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span className="hidden sm:inline">AI Inspector</span>
        </button>

        <button
          onClick={onOpenAddModal}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-2xs"
          id="btn-add-invoice"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Add Invoice</span>
        </button>

        <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block"></div>

        {/* User Badge */}
        <div className="flex items-center gap-2 pl-1">
          <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 border border-blue-200 flex items-center justify-center font-bold text-[11px]">
            GC
          </div>
          <span className="text-xs font-medium text-slate-700 hidden lg:inline">Giselle Chem</span>
        </div>
      </div>

    </header>
  );
};

