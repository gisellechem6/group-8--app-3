import React from 'react';
import { DashboardMetrics } from '../types';
import { Clock, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

interface DashboardStatsProps {
  metrics: DashboardMetrics;
  activeFilterCategory: string;
  onSelectCategoryFilter: (category: string) => void;
}

export const DashboardStats: React.FC<DashboardStatsProps> = ({
  metrics,
  activeFilterCategory,
  onSelectCategoryFilter,
}) => {
  const formatSGD = (amount: number) => {
    return new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency: 'SGD',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs mb-4 flex flex-wrap items-center justify-between gap-3 text-xs">
      
      {/* 1. Total Unpaid */}
      <div
        onClick={() => onSelectCategoryFilter('all_unpaid')}
        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
          activeFilterCategory === 'all_unpaid'
            ? 'bg-blue-50 border-blue-400 text-blue-900 font-medium ring-1 ring-blue-300'
            : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
        }`}
        id="stat-card-total-unpaid"
      >
        <Clock className="w-4 h-4 text-blue-600 shrink-0" />
        <div>
          <span className="text-[10px] font-bold uppercase text-slate-400 block leading-tight">Total Unpaid</span>
          <span className="font-bold text-slate-900 font-mono text-sm">{formatSGD(metrics.totalUnpaidAmount)}</span>
          <span className="text-[10px] text-slate-500 font-medium ml-1.5">({metrics.totalUnpaidCount} Active)</span>
        </div>
      </div>

      {/* 2. Ready for Payment (3-Way Matched) */}
      <div
        onClick={() => onSelectCategoryFilter('ready_for_payment')}
        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
          activeFilterCategory === 'ready_for_payment'
            ? 'bg-emerald-50 border-emerald-400 text-emerald-900 font-medium ring-1 ring-emerald-300'
            : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
        }`}
        id="stat-card-ready-payment"
      >
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
        <div>
          <span className="text-[10px] font-bold uppercase text-emerald-700 block leading-tight">3-Way Matched</span>
          <span className="font-bold text-emerald-700 font-mono text-sm">{formatSGD(metrics.readyForPaymentAmount)}</span>
          <span className="text-[10px] text-emerald-600 font-medium ml-1.5">({metrics.readyForPaymentCount} Ready)</span>
        </div>
      </div>

      {/* 3. Overdue */}
      <div
        onClick={() => onSelectCategoryFilter('overdue')}
        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
          activeFilterCategory === 'overdue'
            ? 'bg-red-50 border-red-400 text-red-900 font-medium ring-1 ring-red-300'
            : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
        }`}
        id="stat-card-overdue"
      >
        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
        <div>
          <span className="text-[10px] font-bold uppercase text-slate-400 block leading-tight">Overdue</span>
          <span className="font-bold text-rose-600 font-mono text-sm">{formatSGD(metrics.overdueAmount)}</span>
          <span className="text-[10px] text-rose-600 font-medium ml-1.5">({metrics.overdueCount} Invoices)</span>
        </div>
      </div>

      {/* 4. Needs Review */}
      <div
        onClick={() => onSelectCategoryFilter('needs_review')}
        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-dashed transition-all cursor-pointer ${
          activeFilterCategory === 'needs_review'
            ? 'bg-purple-50 border-purple-400 text-purple-900 font-medium ring-1 ring-purple-300'
            : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
        }`}
        id="stat-card-needs-review"
      >
        <ShieldCheck className="w-4 h-4 text-purple-600 shrink-0" />
        <div>
          <span className="text-[10px] font-bold uppercase text-slate-400 block leading-tight">Needs Review</span>
          <span className="font-bold text-purple-700 text-sm">{metrics.needsReviewCount}</span>
          <span className="text-[10px] text-purple-600 font-medium ml-1.5">Missing Info</span>
        </div>
      </div>

    </section>
  );
};


