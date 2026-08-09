import React from 'react';
import {
  X,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  FilePlus,
  FileEdit,
  HelpCircle,
  Copy,
  Check,
  RefreshCw,
} from 'lucide-react';

export interface SyncSummaryData {
  success: boolean;
  addedCount: number;
  updatedCount: number;
  needsReviewCount: number;
  totalRowsProcessed: number;
  sheetName?: string;
  spreadsheetId?: string;
  fullError?: string | null;
}

interface SyncSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: SyncSummaryData | null;
  onReSync?: () => void;
  isSyncing?: boolean;
}

export const SyncSummaryModal: React.FC<SyncSummaryModalProps> = ({
  isOpen,
  onClose,
  summary,
  onReSync,
  isSyncing = false,
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen || !summary) return null;

  const handleCopyError = () => {
    if (summary.fullError) {
      navigator.clipboard.writeText(summary.fullError);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg text-slate-100 overflow-hidden my-8 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div
              className={`p-2 rounded-xl border ${
                summary.success
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
              }`}
            >
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {summary.success ? 'Google Sheets Sync Results' : 'Google Sheets Sync Failed'}
              </h3>
              <p className="text-xs text-slate-400">
                Spreadsheet ID: <code className="text-amber-300 font-mono">{summary.spreadsheetId || '13xu1LcP2MBADKqQ1tc02NIk7ZsHp9nbFA8BmOS-SnnA'}</code>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            id="close-sync-modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-sm">
          {summary.success ? (
            <>
              {/* Success Banner */}
              <div className="p-3 bg-emerald-950/60 border border-emerald-500/30 rounded-xl flex items-center space-x-3 text-emerald-200">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span className="text-xs font-semibold">
                  Dashboard successfully updated from worksheet tab{' '}
                  <strong className="text-white">'{summary.sheetName || 'Sheet1'}'</strong>.
                </span>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-3 gap-3 pt-1">
                {/* 1. Added */}
                <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-col items-center justify-center text-center space-y-1">
                  <div className="flex items-center space-x-1 text-emerald-400 font-semibold text-xs">
                    <FilePlus className="w-4 h-4" />
                    <span>Added</span>
                  </div>
                  <span className="text-2xl font-black text-emerald-300 font-mono">
                    {summary.addedCount}
                  </span>
                  <span className="text-[10px] text-slate-500">New Invoices</span>
                </div>

                {/* 2. Updated */}
                <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-col items-center justify-center text-center space-y-1">
                  <div className="flex items-center space-x-1 text-blue-400 font-semibold text-xs">
                    <FileEdit className="w-4 h-4" />
                    <span>Updated</span>
                  </div>
                  <span className="text-2xl font-black text-blue-300 font-mono">
                    {summary.updatedCount}
                  </span>
                  <span className="text-[10px] text-slate-500">Existing Invoices</span>
                </div>

                {/* 3. Needs Review */}
                <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-col items-center justify-center text-center space-y-1">
                  <div className="flex items-center space-x-1 text-amber-400 font-semibold text-xs">
                    <HelpCircle className="w-4 h-4" />
                    <span>Needs Review</span>
                  </div>
                  <span className="text-2xl font-black text-amber-300 font-mono">
                    {summary.needsReviewCount}
                  </span>
                  <span className="text-[10px] text-slate-500">Missing Details</span>
                </div>
              </div>

              {/* Summary Footer text */}
              <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-800/80 text-xs text-slate-400 flex justify-between items-center">
                <span>Total Rows Processed from Google Sheets:</span>
                <span className="font-mono font-bold text-slate-200">
                  {summary.totalRowsProcessed} row(s)
                </span>
              </div>
            </>
          ) : (
            <>
              {/* Failure Error Display */}
              <div className="bg-rose-950/90 border-2 border-rose-500 rounded-xl p-4 space-y-3 text-rose-100 font-mono text-xs shadow-xl">
                <div className="flex items-center justify-between border-b border-rose-800/80 pb-2">
                  <div className="flex items-center space-x-2 text-rose-300 font-bold font-sans">
                    <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                    <span>FULL Google Sheets Error:</span>
                  </div>
                  <button
                    onClick={handleCopyError}
                    className="px-2.5 py-1 bg-rose-900 hover:bg-rose-800 text-rose-200 rounded-lg text-[11px] font-sans font-semibold flex items-center space-x-1 transition-colors cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Error</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3 bg-black/80 rounded-lg border border-rose-900 text-[11px] text-rose-200 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed select-all max-h-60">
                  {summary.fullError || 'Unknown connection error from Google Sheets API.'}
                </pre>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          {onReSync && (
            <button
              onClick={onReSync}
              disabled={isSyncing}
              className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-bold rounded-lg text-xs transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Again'}</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg transition-colors cursor-pointer ml-auto"
            id="btn-close-sync-summary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
