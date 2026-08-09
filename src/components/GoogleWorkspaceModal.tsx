import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  initAuth,
  googleSignIn,
  googleLogout,
  exportInvoicesToGoogleSheets,
  importInvoicesFromGoogleSheets,
  listDriveFiles,
  appendApprovedInvoiceToGoogleSheet,
  fetchGoogleSheetsWithDebug,
  testGoogleSheetsConnection,
  TARGET_MADAM_LIM_SHEET_ID,
  DriveFileItem,
  SheetsDebugInfo,
  TestConnectionResult,
} from '../utils/googleWorkspace';
import { Invoice } from '../types';
import {
  X,
  FileSpreadsheet,
  CloudUpload,
  CloudDownload,
  FolderKanban,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  LogOut,
  Sparkles,
  FileText,
  ShieldCheck,
  Check,
  Search,
  Copy,
  Zap,
  Code2,
} from 'lucide-react';

interface GoogleWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoices: Invoice[];
  onImportInvoices: (newInvoices: Partial<Invoice>[]) => void;
  onSyncFromGoogleSheets?: () => void;
  onShowToast: (message: string) => void;
  onOpenExtractorWithDriveFile?: (file: DriveFileItem) => void;
  isSyncingSheets?: boolean;
}

const APPS_SCRIPT_CODE = `/**
 * PaymentMonitor - Google Apps Script Webhook Integration
 * Target Sheet: 13xu1LcP2MBADKqQ1tc02NIk7ZsHp9nbFA8BmOS-SnnA
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Auto-create 13-column headers if sheet is empty
    if (sheet.getLastRow() === 0) {
      var headers = [
        "Invoice Number",
        "Supplier Name",
        "Invoice Date",
        "PO Number",
        "Invoice Amount",
        "Payment Terms",
        "Due Date",
        "Approval Status",
        "Approval Date",
        "Review Notes",
        "Payment Status",
        "Last Reminder Date",
        "Payment Date"
      ];
      sheet.appendRow(headers);
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#1e293b");
      headerRange.setFontColor("#ffffff");
    }

    if (data.row && Array.isArray(data.row)) {
      sheet.appendRow(data.row);
    } else if (data.invoice) {
      var inv = data.invoice;
      var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
      
      var newRow = [
        inv.invoiceNumber || "N/A",
        inv.supplierName || "N/A",
        inv.approvalDate || today,
        inv.poNumber || "N/A",
        inv.amount || 0,
        inv.paymentTerms || "Net 30",
        inv.calculatedDueDate || inv.fixedDueDate || "N/A",
        "Approved by Madam Lim",
        today,
        inv.notes || "Approved for payment",
        inv.status || "Paid",
        inv.lastReminderDate || "None",
        inv.status === "Paid" ? today : "Pending"
      ];
      sheet.appendRow(newRow);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Row appended successfully to Madam Lim's Google Sheet"
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput("PaymentMonitor Apps Script Endpoint active.");
}`;

export const GoogleWorkspaceModal: React.FC<GoogleWorkspaceModalProps> = ({
  isOpen,
  onClose,
  invoices,
  onImportInvoices,
  onSyncFromGoogleSheets,
  onShowToast,
  onOpenExtractorWithDriveFile,
  isSyncingSheets = false,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'export' | 'import' | 'drive' | 'madamLim'>('madamLim');

  // Debugging Panel State
  const [debugInfo, setDebugInfo] = useState<SheetsDebugInfo>({
    authStatus: 'Not Authenticated',
    connectionStatus: 'Not Checked',
    sheetNameDetected: 'N/A',
    rowsRetrieved: 0,
    error: null,
  });
  const [isDebugging, setIsDebugging] = useState<boolean>(false);

  // Test Connection State
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [isTestingSheets, setIsTestingSheets] = useState<boolean>(false);

  const handleRunTestSheetsConnection = async () => {
    setIsTestingSheets(true);
    setTestResult(null);
    try {
      const res = await testGoogleSheetsConnection(TARGET_MADAM_LIM_SHEET_ID, 0);
      setTestResult(res);
      setDebugInfo({
        authStatus: res.isAuthenticated ? 'Authenticated' : 'Not Authenticated',
        connectionStatus: res.success ? 'Connected (200 OK)' : `Failed (HTTP ${res.apiResponseStatus})`,
        sheetNameDetected: res.selectedSheetName || 'Reviewed_Invoices',
        requestedRange: res.requestedRange || `'Reviewed_Invoices'!A:Z`,
        rawRowsRetrieved: res.rawRowsRetrieved ?? res.totalRowsRetrieved + 1,
        rowsRetrieved: res.totalRowsRetrieved,
        error: res.fullError,
      });
      if (res.success) {
        onShowToast(`Connection Test OK: Retrieved ${res.totalRowsRetrieved} invoice records from range '${res.requestedRange || "'Reviewed_Invoices'!A:Z"}'`);
      } else {
        onShowToast(`Connection Test Failed: ${res.fullError?.substring(0, 80)}`);
      }
    } catch (e: any) {
      const errMsg = `Test Exception: ${e.message || String(e)}`;
      onShowToast(errMsg);
    } finally {
      setIsTestingSheets(false);
    }
  };

  const handleRunDebugCheck = async () => {
    setIsDebugging(true);
    const result = await fetchGoogleSheetsWithDebug(
      TARGET_MADAM_LIM_SHEET_ID,
      0,
      'Reviewed_Invoices'
    );
    setDebugInfo(result.debug);
    setIsDebugging(false);
    if (result.success) {
      onShowToast(`Debug Check OK: ${result.rowsRetrieved} invoice records retrieved from range '${result.requestedRange || "'Reviewed_Invoices'!A:Z"}'`);
    }
  };

  // Madam Lim Webhook & Sync State
  const [madamLimWebhookUrl, setMadamLimWebhookUrl] = useState<string>(
    localStorage.getItem('madam_lim_apps_script_url') || ''
  );
  const [isSyncingMadamLim, setIsSyncingMadamLim] = useState<boolean>(false);
  const [isCopiedScript, setIsCopiedScript] = useState<boolean>(false);

  // Export State
  const [exportSheetTitle, setExportSheetTitle] = useState<string>(
    `Payment Monitor - Invoice Ledger (${new Date().toISOString().split('T')[0]})`
  );
  const [existingSheetId, setExistingSheetId] = useState<string>('');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [lastExportedUrl, setLastExportedUrl] = useState<string | null>(null);
  const [exportScope, setExportScope] = useState<'all' | 'unpaid' | 'overdue'>('all');

  // Import State
  const [importSheetUrl, setImportSheetUrl] = useState<string>('');
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [previewImported, setPreviewImported] = useState<Partial<Invoice>[] | null>(null);

  // Drive Files State
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [isLoadingDriveFiles, setIsLoadingDriveFiles] = useState<boolean>(false);
  const [driveSearch, setDriveSearch] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = initAuth(
      (currUser, token) => {
        setUser(currUser);
        setAccessToken(token);
      },
      () => {
        setUser(null);
        setAccessToken(null);
      }
    );
    return () => unsubscribe();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && accessToken && activeTab === 'drive') {
      fetchDriveFiles();
    }
  }, [isOpen, accessToken, activeTab]);

  if (!isOpen) return null;

  const handleSignIn = async () => {
    setIsAuthenticating(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
        onShowToast(`Connected as ${result.user.email} with Google Workspace permissions.`);
      }
    } catch (err: any) {
      alert(`Sign in failed: ${err.message || 'Error authenticating with Google'}`);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = async () => {
    await googleLogout();
    setUser(null);
    setAccessToken(null);
    setLastExportedUrl(null);
    setPreviewImported(null);
    setDriveFiles([]);
    onShowToast('Signed out from Google Workspace.');
  };

  const fetchDriveFiles = async () => {
    setIsLoadingDriveFiles(true);
    try {
      const files = await listDriveFiles();
      setDriveFiles(files);
    } catch (err: any) {
      console.error('Error fetching drive files:', err);
    } finally {
      setIsLoadingDriveFiles(false);
    }
  };

  // Filter invoices for export
  const invoicesToExport = invoices.filter((inv) => {
    if (exportScope === 'unpaid') return inv.status === 'Unpaid';
    if (exportScope === 'overdue') return inv.status === 'Unpaid' && (inv.overdueDays || 0) > 0;
    return true;
  });

  // Handle Export to Google Sheets
  const handleExport = async () => {
    if (!accessToken) {
      alert('Please sign in with Google first.');
      return;
    }

    const actionText = existingSheetId.trim()
      ? `update Google Sheet (ID: ${existingSheetId})`
      : `create a new Google Sheet named "${exportSheetTitle}"`;

    const confirmed = window.confirm(
      `Are you sure you want to ${actionText} with ${invoicesToExport.length} invoice records?`
    );

    if (!confirmed) return;

    setIsExporting(true);
    try {
      const res = await exportInvoicesToGoogleSheets(
        invoicesToExport,
        exportSheetTitle,
        existingSheetId.trim() || undefined
      );

      setLastExportedUrl(res.spreadsheetUrl);
      onShowToast(`Successfully exported ${res.rowsExported} invoices to Google Sheets!`);
    } catch (err: any) {
      alert(`Export failed: ${err.message || 'Failed to export to Google Sheets'}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Handle Fetch Preview for Import
  const handleFetchImportPreview = async () => {
    if (!importSheetUrl.trim()) {
      alert('Please enter a Google Sheet URL or Spreadsheet ID.');
      return;
    }

    setIsImporting(true);
    try {
      const rows = await importInvoicesFromGoogleSheets(importSheetUrl);
      setPreviewImported(rows);
      if (rows.length === 0) {
        onShowToast('No valid invoice rows found in the specified Google Sheet.');
      } else {
        onShowToast(`Parsed ${rows.length} invoice rows from Google Sheet.`);
      }
    } catch (err: any) {
      alert(`Failed to read Google Sheet: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  // Handle Confirm Import
  const handleConfirmImport = () => {
    if (!previewImported || previewImported.length === 0) return;

    const confirmed = window.confirm(
      `Import ${previewImported.length} invoices into Payment Monitor?`
    );

    if (!confirmed) return;

    onImportInvoices(previewImported);
    onShowToast(`Successfully imported ${previewImported.length} invoices from Google Sheets!`);
    setPreviewImported(null);
    setImportSheetUrl('');
    onClose();
  };

  const handleSaveWebhookUrl = (url: string) => {
    setMadamLimWebhookUrl(url);
    localStorage.setItem('madam_lim_apps_script_url', url);
    onShowToast('Apps Script Webhook URL saved successfully.');
  };

  const handleSyncApprovedInvoicesToMadamLim = async () => {
    const approvedInvoices = invoices.filter((i) => i.status === 'Paid');
    if (approvedInvoices.length === 0) {
      onShowToast('No Paid or Approved invoices found in system to sync.');
      return;
    }

    setIsSyncingMadamLim(true);
    let syncedCount = 0;

    for (const inv of approvedInvoices) {
      try {
        await appendApprovedInvoiceToGoogleSheet(inv, madamLimWebhookUrl);
        syncedCount++;
      } catch (err) {
        console.error('Failed to sync invoice:', inv.invoiceNumber, err);
      }
    }

    setIsSyncingMadamLim(false);
    if (syncedCount > 0) {
      onShowToast(`Successfully appended ${syncedCount} approved invoice row(s) to Madam Lim's Google Sheet!`);
    } else {
      alert(`Could not sync to Madam Lim's Google Sheet. Please sign in with Google or save your Apps Script Webhook URL.`);
    }
  };

  const filteredDriveFiles = driveFiles.filter((f) =>
    f.name.toLowerCase().includes(driveSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-400 border border-emerald-500/30">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <span>Google Workspace Integration</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold uppercase tracking-wider border border-emerald-500/30">
                  Sheets & Drive
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Sync live invoice ledger, export reports to Google Sheets, and import Drive documents
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Account Bar */}
        <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {user && accessToken ? (
            <div className="flex items-center space-x-3">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  className="w-8 h-8 rounded-full border border-slate-300"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                  {user.email?.[0].toUpperCase() || 'G'}
                </div>
              )}
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-slate-900">{user.displayName || user.email}</span>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold border border-emerald-300 flex items-center gap-1">
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span>Workspace Connected</span>
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  OAuth Scopes: <code className="text-[10px] bg-slate-200 px-1 py-0.5 rounded text-slate-700">spreadsheets</code>, <code className="text-[10px] bg-slate-200 px-1 py-0.5 rounded text-slate-700">drive.file</code>
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full">
              <div className="text-xs text-slate-600">
                <p className="font-semibold text-slate-900">Sign in to connect Google Workspace</p>
                <p className="text-[11px] text-slate-500">Export live ledgers to Google Sheets and read Drive files with explicit permission.</p>
              </div>

              {/* Official Google Sign-In Button */}
              <button
                onClick={handleSignIn}
                disabled={isAuthenticating}
                className="inline-flex items-center justify-center px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl shadow-xs transition-colors font-medium text-xs space-x-2 disabled:opacity-50 cursor-pointer"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                </svg>
                <span>{isAuthenticating ? 'Connecting...' : 'Sign in with Google'}</span>
              </button>
            </div>
          )}

          {user && accessToken && (
            <button
              onClick={handleLogout}
              className="px-2.5 py-1 text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors flex items-center space-x-1 font-medium"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Disconnect</span>
            </button>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-white px-6 shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('madamLim')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center space-x-2 transition-colors shrink-0 ${
              activeTab === 'madamLim'
                ? 'border-emerald-600 text-emerald-800 bg-emerald-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Zap className="w-4 h-4 text-emerald-600" />
            <span>Madam Lim's Google Sheet Auto-Sync</span>
          </button>

          <button
            onClick={() => setActiveTab('export')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center space-x-2 transition-colors shrink-0 ${
              activeTab === 'export'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <CloudUpload className="w-4 h-4" />
            <span>Export Custom Sheet</span>
          </button>

          <button
            onClick={() => setActiveTab('import')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center space-x-2 transition-colors shrink-0 ${
              activeTab === 'import'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <CloudDownload className="w-4 h-4" />
            <span>Import from Sheet</span>
          </button>

          <button
            onClick={() => setActiveTab('drive')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center space-x-2 transition-colors shrink-0 ${
              activeTab === 'drive'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FolderKanban className="w-4 h-4" />
            <span>Drive Documents</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 grow">

          {/* TAB 0: MADAM LIM GOOGLE SHEET AUTO-SYNC */}
          {activeTab === 'madamLim' && (
            <div className="space-y-5">
              <div className="bg-gradient-to-r from-emerald-900 to-slate-900 border border-emerald-700/50 rounded-2xl p-5 text-white shadow-md">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 bg-emerald-500/20 rounded-lg border border-emerald-400/30 text-emerald-300">
                        <Zap className="w-4 h-4" />
                      </span>
                      <h4 className="font-bold text-base text-white">Madam Lim's Payment Monitoring Sheet</h4>
                    </div>
                    <p className="text-xs text-emerald-200/80 mt-1">
                      Target Spreadsheet: <code className="bg-black/40 px-1.5 py-0.5 rounded text-emerald-300 font-mono text-[11px]">{TARGET_MADAM_LIM_SHEET_ID}</code>
                    </p>
                  </div>

                  <a
                    href="https://docs.google.com/spreadsheets/d/13xu1LcP2MBADKqQ1tc02NIk7ZsHp9nbFA8BmOS-SnnA/edit?gid=0#gid=0"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition-colors shrink-0"
                  >
                    <span>Open Sheet in Google Docs</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="mt-4 pt-3 border-t border-emerald-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center space-x-2 text-emerald-200 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Auto-sync triggers automatically whenever an invoice is approved / marked Paid</span>
                  </div>

                  <button
                    onClick={handleSyncApprovedInvoicesToMadamLim}
                    disabled={isSyncingMadamLim}
                    className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-900 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${isSyncingMadamLim ? 'animate-spin' : ''}`} />
                    <span>{isSyncingMadamLim ? 'Syncing...' : 'Sync Approved Invoices Now'}</span>
                  </button>
                </div>
              </div>

              {/* LIVE GOOGLE SHEETS CONNECTION DEBUGGER PANEL */}
              <div className="bg-slate-900 border-2 border-amber-500/80 rounded-2xl p-4 shadow-lg text-slate-100 space-y-3 font-sans">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-700/80 pb-2.5">
                  <div className="flex items-center space-x-2">
                    <Code2 className="w-5 h-5 text-amber-400 shrink-0" />
                    <div>
                      <h4 className="font-bold text-sm text-amber-300">Google Sheets Integration Debugger</h4>
                      <p className="text-[11px] text-slate-400">Live connection diagnostic for Spreadsheet ID: <code className="text-amber-200">{TARGET_MADAM_LIM_SHEET_ID}</code> (gid: 0, Reviewed_Invoices)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {onSyncFromGoogleSheets && (
                      <button
                        onClick={onSyncFromGoogleSheets}
                        disabled={isSyncingSheets}
                        className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSheets ? 'animate-spin' : ''}`} />
                        <span>{isSyncingSheets ? 'Syncing Invoices...' : 'Sync Invoices'}</span>
                      </button>
                    )}
                    <button
                      onClick={handleRunDebugCheck}
                      disabled={isDebugging}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isDebugging ? 'animate-spin' : ''}`} />
                      <span>{isDebugging ? 'Checking...' : 'Check API Status'}</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs font-mono">
                  <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-sans tracking-wider block font-semibold">1. Auth Status</span>
                    <span className={user && accessToken ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                      {user && accessToken ? `Connected (${user.email || 'Google User'})` : 'Not Authenticated'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-sans tracking-wider block font-semibold">2. Connection</span>
                    <span className={debugInfo.connectionStatus.includes('Connected') || debugInfo.connectionStatus.includes('200') ? 'text-emerald-400 font-bold' : debugInfo.connectionStatus.includes('Failed') ? 'text-rose-400 font-bold' : 'text-amber-400 font-bold'}>
                      {debugInfo.connectionStatus}
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-sans tracking-wider block font-semibold">3. Requested Range</span>
                    <span className="text-amber-300 font-bold truncate block">
                      {debugInfo.requestedRange || `'Approved_For_Payment'!A:Z`}
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-sans tracking-wider block font-semibold">4. Raw Rows (Pre-filter)</span>
                    <span className="text-blue-300 font-bold">
                      {debugInfo.rawRowsRetrieved !== undefined ? `${debugInfo.rawRowsRetrieved} raw row(s)` : 'N/A'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-sans tracking-wider block font-semibold">5. Invoice Records</span>
                    <span className="text-emerald-300 font-bold">
                      {debugInfo.rowsRetrieved} record(s) (excl. header)
                    </span>
                  </div>
                </div>

                {/* First 5 Actual Invoice Records Preview Table */}
                {debugInfo.first5InvoicesPreview && debugInfo.first5InvoicesPreview.length > 0 && (
                  <div className="p-3.5 bg-slate-950/90 border border-slate-800 rounded-xl space-y-2 text-xs font-mono">
                    <div className="flex items-center justify-between text-amber-300 font-bold font-sans">
                      <span className="flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-emerald-400" />
                        <span>First 5 Actual Invoice Records Preview (Testing):</span>
                      </span>
                      <span className="text-[10px] text-slate-400">Row 1 = Headers | Row 2+ = Invoices</span>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-slate-800">
                      <table className="w-full text-[11px] text-left text-slate-300">
                        <thead className="bg-slate-900 text-slate-400 uppercase text-[9px] tracking-wider border-b border-slate-800">
                          <tr>
                            <th className="p-2">#</th>
                            <th className="p-2">Invoice #</th>
                            <th className="p-2">Supplier Name</th>
                            <th className="p-2">Date</th>
                            <th className="p-2">Amount</th>
                            <th className="p-2">Terms</th>
                            <th className="p-2">Calculated Due Date</th>
                            <th className="p-2">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 bg-slate-950/50">
                          {debugInfo.first5InvoicesPreview.map((inv, idx) => (
                            <tr key={idx} className="hover:bg-slate-900/60">
                              <td className="p-2 text-slate-500 font-bold">{idx + 1}</td>
                              <td className="p-2 font-bold text-amber-200">{inv.invoiceNumber || 'N/A'}</td>
                              <td className="p-2 text-slate-200">{inv.supplierName || 'Needs Review'}</td>
                              <td className="p-2 text-slate-400">{inv.invoiceDate || 'N/A'}</td>
                              <td className="p-2 font-bold text-emerald-400">${inv.amount?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}</td>
                              <td className="p-2 text-slate-400">{inv.paymentTerms || 'Net 30'}</td>
                              <td className="p-2 text-blue-300 font-bold">{inv.calculatedDueDate || inv.fixedDueDate || 'N/A'}</td>
                              <td className="p-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  inv.status === 'Paid' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-300 border border-amber-800'
                                }`}>
                                  {inv.status || 'Unpaid'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Excluded / Filtered Rows Log */}
                {debugInfo.excludedRowsLog && debugInfo.excludedRowsLog.length > 0 && (
                  <div className="p-3.5 bg-amber-950/40 border border-amber-800/60 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center space-x-2 text-amber-300 font-bold font-sans">
                      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Filtered/Excluded Rows ({debugInfo.excludedRowsLog.length}):</span>
                    </div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {debugInfo.excludedRowsLog.map((ex, idx) => (
                        <div key={idx} className="p-2.5 bg-black/70 rounded-lg border border-amber-900/50 font-mono text-[11px] text-amber-200/90 space-y-1">
                          <div className="font-bold text-amber-300 flex items-center justify-between">
                            <span>Google Sheets Row #{ex.rowIndex}</span>
                            <span className="text-[10px] px-1.5 py-0.5 bg-rose-950 text-rose-300 rounded border border-rose-800">Excluded</span>
                          </div>
                          <p className="text-[11px] text-amber-100 font-sans">{ex.reason}</p>
                          {ex.rawRow && ex.rawRow.length > 0 && (
                            <div className="text-[10px] text-slate-400 truncate bg-slate-950 p-1 rounded border border-slate-800">
                              Raw values: [{ex.rawRow.join(', ')}]
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Exact Error Message display */}
                {debugInfo.error && (
                  <div className="p-3 bg-rose-950/90 border border-rose-500/60 rounded-xl text-rose-200 text-xs font-mono space-y-1.5">
                    <div className="flex items-center space-x-1.5 text-rose-300 font-bold font-sans">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                      <span>Exact Error Message:</span>
                    </div>
                    <p className="p-2.5 bg-black/70 rounded-lg border border-rose-900/80 break-words whitespace-pre-wrap text-[11px] text-rose-100 selection:bg-rose-900 select-all">
                      {debugInfo.error}
                    </p>
                  </div>
                )}
              </div>

              {/* Required 13 Columns Preview */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="text-xs font-bold text-slate-900 mb-2 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  <span>13 Sheet Columns Configured</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Invoice Number',
                    'Supplier Name',
                    'Invoice Date',
                    'PO Number',
                    'Invoice Amount',
                    'Payment Terms',
                    'Due Date',
                    'Approval Status',
                    'Approval Date',
                    'Review Notes',
                    'Payment Status',
                    'Last Reminder Date',
                    'Payment Date',
                  ].map((col, idx) => (
                    <span
                      key={col}
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-medium text-slate-700 shadow-2xs flex items-center gap-1"
                    >
                      <span className="text-[10px] text-slate-400 font-mono">#{idx + 1}</span>
                      <span>{col}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Setup Webhook Option */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Code2 className="w-4 h-4 text-blue-600" />
                      <span>Google Apps Script Webhook Integration (Recommended)</span>
                    </h5>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Allows direct row appends from PaymentMonitor to Madam Lim's Google Sheet without browser popup prompts.
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    type="url"
                    value={madamLimWebhookUrl}
                    onChange={(e) => setMadamLimWebhookUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 font-mono focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    onClick={() => handleSaveWebhookUrl(madamLimWebhookUrl)}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors shrink-0"
                  >
                    Save Webhook URL
                  </button>
                </div>

                {/* Copyable Apps Script Code */}
                <div className="bg-slate-900 rounded-xl p-3 text-slate-200 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-emerald-400">Google Apps Script Code (Code.gs)</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(APPS_SCRIPT_CODE);
                        setIsCopiedScript(true);
                        onShowToast('Copied Apps Script code to clipboard!');
                        setTimeout(() => setIsCopiedScript(false), 3000);
                      }}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded-lg text-[11px] font-bold border border-slate-700 flex items-center space-x-1 transition-colors cursor-pointer"
                    >
                      {isCopiedScript ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{isCopiedScript ? 'Copied!' : 'Copy Script Code'}</span>
                    </button>
                  </div>

                  <pre className="max-h-40 overflow-y-auto text-[10px] font-mono bg-slate-950 p-2.5 rounded-lg text-emerald-300/90 whitespace-pre scrollbar-thin">
                    {APPS_SCRIPT_CODE}
                  </pre>
                </div>

                {/* Setup Instructions */}
                <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3 text-xs text-amber-950 space-y-1">
                  <p className="font-bold text-amber-900">How to install in Google Sheets:</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-[11px] text-amber-800">
                    <li>Open Madam Lim's Google Sheet and click <b>Extensions &gt; Apps Script</b>.</li>
                    <li>Paste the copied script code into <b>Code.gs</b> and save.</li>
                    <li>Click <b>Deploy &gt; New deployment</b>, set type to <b>Web app</b>.</li>
                    <li>Set <i>"Execute as"</i> to <b>Me</b> and <i>"Who has access"</i> to <b>Anyone</b>.</li>
                    <li>Click Deploy, authorize, and copy the Web App URL into the box above!</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: EXPORT TO GOOGLE SHEETS */}
          {activeTab === 'export' && (
            <div className="space-y-4">
              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-4 text-xs text-emerald-950 flex items-start space-x-3">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-emerald-900">Live Google Sheets Ledger Export</p>
                  <p className="text-emerald-800 mt-0.5">
                    Generates a structured Google Sheet with 14 verified columns (Invoice Number, Supplier, SGD Amount, Status, Due Date, PO/GRN matching status, and Bank details).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Export Scope</label>
                  <select
                    value={exportScope}
                    onChange={(e: any) => setExportScope(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:ring-2 focus:ring-slate-900"
                  >
                    <option value="all">All Invoices ({invoices.length})</option>
                    <option value="unpaid">
                      Unpaid Invoices Only ({invoices.filter((i) => i.status === 'Unpaid').length})
                    </option>
                    <option value="overdue">
                      Overdue Invoices Only (
                      {invoices.filter((i) => i.status === 'Unpaid' && (i.overdueDays || 0) > 0).length})
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Spreadsheet Title</label>
                  <input
                    type="text"
                    value={exportSheetTitle}
                    onChange={(e) => setExportSheetTitle(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-slate-900"
                    placeholder="Enter sheet title..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Optional: Update Existing Spreadsheet ID
                </label>
                <input
                  type="text"
                  value={existingSheetId}
                  onChange={(e) => setExistingSheetId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-slate-900 font-mono"
                  placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms (Leave blank to create new)"
                />
              </div>

              {/* Preview Box */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between items-center font-bold text-slate-900">
                  <span>Export Summary</span>
                  <span className="text-emerald-700 font-mono">{invoicesToExport.length} Record(s)</span>
                </div>
                <p className="text-slate-600">
                  Total Value:{' '}
                  <strong className="text-slate-900">
                    SGD{' '}
                    {invoicesToExport
                      .reduce((sum, i) => sum + (i.amount || 0), 0)
                      .toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </strong>
                </p>
              </div>

              {/* Action Button */}
              <div className="pt-2 flex items-center justify-between">
                {lastExportedUrl ? (
                  <a
                    href={lastExportedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg text-xs font-bold transition-colors border border-emerald-300"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Open Exported Google Sheet</span>
                  </a>
                ) : (
                  <div></div>
                )}

                <button
                  onClick={handleExport}
                  disabled={isExporting || !accessToken || invoicesToExport.length === 0}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm transition-colors flex items-center space-x-2 disabled:opacity-50 cursor-pointer"
                >
                  <CloudUpload className="w-4 h-4" />
                  <span>{isExporting ? 'Creating Google Sheet...' : 'Export to Google Sheets'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: IMPORT FROM GOOGLE SHEETS */}
          {activeTab === 'import' && (
            <div className="space-y-4">
              <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-4 text-xs text-blue-950 flex items-start space-x-3">
                <CloudDownload className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-blue-900">Import Invoices from Google Sheets</p>
                  <p className="text-blue-800 mt-0.5">
                    Paste any public or shared Google Sheet URL or Spreadsheet ID. Rows will be parsed automatically for supplier name, invoice number, amount, payment terms, and due date.
                  </p>
                </div>
              </div>

              <div className="flex space-x-2">
                <input
                  type="text"
                  value={importSheetUrl}
                  onChange={(e) => setImportSheetUrl(e.target.value)}
                  placeholder="Paste Google Sheet URL (https://docs.google.com/spreadsheets/d/...) or ID"
                  className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-mono placeholder-slate-400 focus:ring-2 focus:ring-slate-900"
                />
                <button
                  onClick={handleFetchImportPreview}
                  disabled={isImporting || !accessToken || !importSheetUrl.trim()}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50 flex items-center space-x-1.5 shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isImporting ? 'animate-spin' : ''}`} />
                  <span>{isImporting ? 'Reading Sheet...' : 'Parse Sheet'}</span>
                </button>
              </div>

              {/* Preview Table */}
              {previewImported && (
                <div className="space-y-3 pt-2">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Parsed Invoices ({previewImported.length})</span>
                    </h4>

                    <button
                      onClick={handleConfirmImport}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs transition-colors shadow-2xs"
                    >
                      Confirm & Import {previewImported.length} Invoice(s)
                    </button>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-2">Supplier</th>
                          <th className="p-2">Inv #</th>
                          <th className="p-2 text-right">Amount (SGD)</th>
                          <th className="p-2">Status</th>
                          <th className="p-2">Terms</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {previewImported.map((inv, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-2 font-medium text-slate-900">{inv.supplierName}</td>
                            <td className="p-2 font-mono text-slate-600">{inv.invoiceNumber}</td>
                            <td className="p-2 text-right font-semibold text-slate-900">
                              SGD {inv.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-2 font-bold text-slate-700">{inv.status}</td>
                            <td className="p-2 text-slate-500">{inv.paymentTerms}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: GOOGLE DRIVE DOCUMENTS */}
          {activeTab === 'drive' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-xs text-slate-900">Google Drive Files & Spreadsheets</h4>
                  <p className="text-[11px] text-slate-500">
                    Browse files in your connected Google Drive to import directly.
                  </p>
                </div>

                <button
                  onClick={fetchDriveFiles}
                  disabled={isLoadingDriveFiles || !accessToken}
                  className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 text-xs font-semibold flex items-center space-x-1"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDriveFiles ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={driveSearch}
                  onChange={(e) => setDriveSearch(e.target.value)}
                  placeholder="Filter Drive files..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-slate-900"
                />
              </div>

              {!accessToken ? (
                <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
                  <FolderKanban className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-700">Google Drive Not Connected</p>
                  <p className="text-[11px] text-slate-500 mt-1 mb-3">
                    Sign in with Google to browse Drive spreadsheets and documents.
                  </p>
                  <button
                    onClick={handleSignIn}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold"
                  >
                    Sign in with Google
                  </button>
                </div>
              ) : isLoadingDriveFiles ? (
                <div className="p-8 text-center text-xs text-slate-500">Loading Google Drive files...</div>
              ) : filteredDriveFiles.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 text-xs text-slate-500">
                  No spreadsheets or invoice files found in Google Drive.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pr-1">
                  {filteredDriveFiles.map((file) => (
                    <div
                      key={file.id}
                      className="p-3 bg-white border border-slate-200 hover:border-emerald-500 rounded-xl flex items-center justify-between transition-colors shadow-2xs group"
                    >
                      <div className="flex items-center space-x-2.5 overflow-hidden">
                        <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0" />
                        <div className="overflow-hidden">
                          <p className="text-xs font-bold text-slate-900 truncate">{file.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {file.mimeType.includes('spreadsheet') ? 'Google Sheet' : 'Drive File'}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          if (file.mimeType.includes('spreadsheet')) {
                            setImportSheetUrl(file.id);
                            setActiveTab('import');
                          } else if (onOpenExtractorWithDriveFile) {
                            onOpenExtractorWithDriveFile(file);
                          } else {
                            alert(`File selected: ${file.name}`);
                          }
                        }}
                        className="px-2.5 py-1 bg-slate-100 group-hover:bg-emerald-600 group-hover:text-white text-slate-700 rounded-lg text-[11px] font-bold transition-colors shrink-0"
                      >
                        Select
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0">
          <div className="text-[11px] text-slate-500 flex items-center space-x-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Google Workspace Security & Scopes Configured</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
