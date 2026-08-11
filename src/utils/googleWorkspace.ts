import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { Invoice, InvoiceStatus } from '../types';

// Initialize Firebase app if not already initialized
const firebaseApp = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(firebaseApp);

const googleProvider = new GoogleAuthProvider();
// Add required Google Workspace scopes
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');

let isSigningIn = false;
let cachedAccessToken: string | null = sessionStorage.getItem('google_access_token');
let activeSignInPromise: Promise<{ user: User; accessToken: string } | null> | null = null;

/**
 * Initialize auth listener and token caching
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const token = await getAccessToken();
      if (token) {
        if (onAuthSuccess) onAuthSuccess(user, token);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      sessionStorage.removeItem('google_access_token');
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Trigger Google Sign In popup with Workspace scopes
 */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  if (activeSignInPromise) {
    console.log('[googleSignIn] Reusing existing active sign-in promise to prevent concurrent popups.');
    return activeSignInPromise;
  }

  activeSignInPromise = (async () => {
    try {
      isSigningIn = true;
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      
      if (!credential?.accessToken) {
        throw new Error('Failed to obtain Google Workspace access token.');
      }

      cachedAccessToken = credential.accessToken;
      sessionStorage.setItem('google_access_token', credential.accessToken);
      return { user: result.user, accessToken: cachedAccessToken };
    } catch (error: any) {
      console.error('Google Workspace sign in error:', error);
      throw error;
    } finally {
      isSigningIn = false;
      activeSignInPromise = null;
    }
  })();

  return activeSignInPromise;
};

/**
 * Get current cached access token
 */
export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken) return cachedAccessToken;
  const stored = sessionStorage.getItem('google_access_token');
  if (stored) {
    cachedAccessToken = stored;
    return stored;
  }
  return null;
};

/**
 * Sign out user and clear token cache
 */
export const googleLogout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  sessionStorage.removeItem('google_access_token');
};

export interface SheetsDebugInfo {
  authStatus: string;
  connectionStatus: string;
  sheetNameDetected: string;
  requestedRange?: string;
  rawRowsRetrieved?: number;
  rowsRetrieved: number;
  excludedCount?: number;
  excludedRowsLog?: { rowIndex: number; rawRow: string[]; reason: string }[];
  first5InvoicesPreview?: Partial<Invoice>[];
  error: string | null;
}

export interface SheetsFetchResult {
  success: boolean;
  spreadsheetId?: string;
  sheetName?: string;
  requestedRange?: string;
  gid?: number | string;
  rawRowsRetrieved?: number;
  rowsRetrieved: number;
  invoices: Partial<Invoice>[];
  first5Invoices?: Partial<Invoice>[];
  excludedRowsLog?: { rowIndex: number; rawRow: string[]; reason: string }[];
  error?: string;
  debug: SheetsDebugInfo;
}

export interface WorksheetTabInfo {
  title: string;
  sheetId: number;
  rows: number;
  cols: number;
}

export interface TestConnectionResult {
  success: boolean;
  isAuthenticated: boolean;
  spreadsheetId: string;
  selectedSheetName: string;
  requestedRange?: string;
  worksheets: WorksheetTabInfo[];
  first5Rows: string[][];
  rawRowsRetrieved?: number;
  totalRowsRetrieved: number;
  apiResponseStatus: number;
  fullError: string | null;
  logs: string[];
}

export const TARGET_MADAM_LIM_SHEET_ID = '13xu1LcP2MBADKqQ1tc02NIk7ZsHp9nbFA8BmOS-SnnA';

/**
 * Execute basic Google Sheets connection test
 */
export const testGoogleSheetsConnection = async (
  spreadsheetId: string = TARGET_MADAM_LIM_SHEET_ID,
  targetGid: number = 668977970
): Promise<TestConnectionResult> => {
  let token = await getAccessToken();

  // If no token cached, attempt interactive sign in using Firebase Google OAuth
  if (!token) {
    try {
      const authRes = await googleSignIn();
      token = authRes?.accessToken || null;
    } catch (e: any) {
      const fullError = `Google OAuth Authentication Failed: ${e.message || String(e)}`;
      console.error('[GoogleSheetsTest]', fullError);
      return {
        success: false,
        isAuthenticated: false,
        spreadsheetId,
        selectedSheetName: 'N/A',
        worksheets: [],
        first5Rows: [],
        totalRowsRetrieved: 0,
        apiResponseStatus: 401,
        fullError,
        logs: [`Authentication error: ${e.message || String(e)}`],
      };
    }
  }

  if (!token) {
    const fullError = 'User cancelled or failed Google OAuth authentication.';
    console.error('[GoogleSheetsTest]', fullError);
    return {
      success: false,
      isAuthenticated: false,
      spreadsheetId,
      selectedSheetName: 'N/A',
      worksheets: [],
      first5Rows: [],
      totalRowsRetrieved: 0,
      apiResponseStatus: 401,
      fullError,
      logs: ['No access token available'],
    };
  }

  try {
    const res = await fetch('/api/sheets/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spreadsheetId,
        accessToken: token,
        targetGid,
      }),
    });

    const data: TestConnectionResult = await res.json();

    // If token was expired (401), clear cached token and offer auto re-auth once
    if (res.status === 401 || data.apiResponseStatus === 401) {
      cachedAccessToken = null;
      sessionStorage.removeItem('google_access_token');
      try {
        const freshAuth = await googleSignIn();
        if (freshAuth?.accessToken) {
          const retryRes = await fetch('/api/sheets/test-connection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              spreadsheetId,
              accessToken: freshAuth.accessToken,
              targetGid,
            }),
          });
          return await retryRes.json();
        }
      } catch (e) {
        console.warn('Re-auth on test connection failed:', e);
      }
    }

    // Log all required details to console
    console.log('[GoogleSheetsTest Output]');
    console.log('User Authenticated:', data.isAuthenticated);
    console.log('Spreadsheet ID:', data.spreadsheetId);
    console.log('Sheet/Tab Name:', data.selectedSheetName);
    console.log('API Response Status:', data.apiResponseStatus);
    console.log('Worksheets Found:', data.worksheets);
    console.log('Total Rows Retrieved:', data.totalRowsRetrieved);
    console.log('First 5 Rows:', data.first5Rows);
    console.log('Full Error:', data.fullError);

    return data;
  } catch (err: any) {
    const fullError = `Network Exception calling /api/sheets/test-connection: ${err.message || String(err)}`;
    console.error('[GoogleSheetsTest]', fullError);
    return {
      success: false,
      isAuthenticated: true,
      spreadsheetId,
      selectedSheetName: 'N/A',
      worksheets: [],
      first5Rows: [],
      totalRowsRetrieved: 0,
      apiResponseStatus: 0,
      fullError,
      logs: [fullError],
    };
  }
};

/**
 * Fetch Google Sheets Data via server-side API with detailed debug information.
 * Uses the exact same Google AI Studio / Firebase Google OAuth authentication flow as testGoogleSheetsConnection.
 */
export const fetchGoogleSheetsWithDebug = async (
  sheetUrlOrId?: string,
  targetGid?: number | string,
  targetSheetName?: string,
  isRetryAfterReAuth: boolean = false
): Promise<SheetsFetchResult> => {
  let token = await getAccessToken();

  // If no token cached, trigger the exact same interactive googleSignIn as testGoogleSheetsConnection
  if (!token) {
    try {
      const authRes = await googleSignIn();
      token = authRes?.accessToken || null;
    } catch (e: any) {
      console.error('[fetchGoogleSheetsWithDebug] Google Workspace OAuth sign-in failed:', e);
      return {
        success: false,
        rowsRetrieved: 0,
        invoices: [],
        error: `Google Workspace authentication failed: ${e.message || String(e)}. Please sign in to Google.`,
        debug: {
          authStatus: 'Not Authenticated',
          connectionStatus: 'Failed (Authentication Required)',
          sheetNameDetected: 'N/A',
          rowsRetrieved: 0,
          error: `Google OAuth failed: ${e.message || String(e)}`,
        },
      };
    }
  }

  if (!token) {
    return {
      success: false,
      rowsRetrieved: 0,
      invoices: [],
      error: 'Google Workspace authentication required. Please sign in with Google.',
      debug: {
        authStatus: 'Not Authenticated',
        connectionStatus: 'Failed (Authentication Required)',
        sheetNameDetected: 'N/A',
        rowsRetrieved: 0,
        error: 'Missing Google OAuth Access Token.',
      },
    };
  }

  try {
    const res = await fetch('/api/sheets/fetch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sheetUrlOrId: sheetUrlOrId || TARGET_MADAM_LIM_SHEET_ID,
        accessToken: token,
        targetGid: targetGid !== undefined ? targetGid : 668977970,
        targetSheetName: targetSheetName,
      }),
    });

    const data = await res.json();

    // If HTTP 401 returned (invalid or expired OAuth token) and not already retried:
    const is401Error =
      res.status === 401 ||
      (data.error && (data.error.includes('401') || data.error.includes('invalid authentication credentials') || data.error.toLowerCase().includes('oauth')));

    if (is401Error && !isRetryAfterReAuth) {
      console.warn('[fetchGoogleSheetsWithDebug] Received 401 (Invalid/Expired Credentials). Clearing cached token and prompting for re-authentication...');
      cachedAccessToken = null;
      sessionStorage.removeItem('google_access_token');

      try {
        const freshAuth = await googleSignIn();
        if (freshAuth?.accessToken) {
          // Retry the request with the fresh token
          return await fetchGoogleSheetsWithDebug(sheetUrlOrId, targetGid, targetSheetName, true);
        }
      } catch (reAuthErr: any) {
        console.error('[fetchGoogleSheetsWithDebug] Re-authentication failed or cancelled by user:', reAuthErr);
        return {
          success: false,
          rowsRetrieved: 0,
          invoices: [],
          error: 'Your Google OAuth session has expired. Please sign in to Google to re-authenticate.',
          debug: {
            authStatus: 'Session Expired',
            connectionStatus: 'Failed (HTTP 401 - Expired Token)',
            sheetNameDetected: 'N/A',
            rowsRetrieved: 0,
            error: 'OAuth session expired. Please sign in to Google to re-authenticate.',
          },
        };
      }
    }

    if (!res.ok || !data.success) {
      return {
        success: false,
        rowsRetrieved: 0,
        invoices: [],
        error: data.error || `HTTP ${res.status} Error fetching Google Sheets data`,
        debug: data.debug || {
          authStatus: 'Authenticated',
          connectionStatus: `Failed (${res.status} ${res.statusText})`,
          sheetNameDetected: 'N/A',
          rowsRetrieved: 0,
          error: data.error || `HTTP ${res.status} Error fetching Google Sheets data`,
        },
      };
    }

    return {
      success: true,
      spreadsheetId: data.spreadsheetId,
      sheetName: data.sheetName,
      requestedRange: data.requestedRange || `'${data.sheetName || 'Matched_Results'}'!A:M`,
      gid: data.gid,
      rawRowsRetrieved: data.rawRowsRetrieved || 0,
      rowsRetrieved: data.rowsRetrieved || 0,
      invoices: data.invoices || [],
      first5Invoices: data.first5Invoices || (data.invoices ? data.invoices.slice(0, 5) : []),
      excludedRowsLog: data.excludedRowsLog || [],
      debug: data.debug || {
        authStatus: 'Authenticated',
        connectionStatus: 'Connected (200 OK)',
        sheetNameDetected: `${data.sheetName || 'Matched_Results'} (gid: ${data.gid || 1695302381})`,
        requestedRange: data.requestedRange || `'${data.sheetName || 'Matched_Results'}'!A:M`,
        rawRowsRetrieved: data.rawRowsRetrieved || 0,
        rowsRetrieved: data.rowsRetrieved || 0,
        excludedCount: data.excludedRowsLog ? data.excludedRowsLog.length : 0,
        excludedRowsLog: data.excludedRowsLog || [],
        first5InvoicesPreview: data.first5Invoices || (data.invoices ? data.invoices.slice(0, 5) : []),
        error: null,
      },
    };
  } catch (err: any) {
    console.error('Error in fetchGoogleSheetsWithDebug:', err);
    return {
      success: false,
      rowsRetrieved: 0,
      invoices: [],
      error: err.message || 'Network error connecting to Google Sheets API server.',
      debug: {
        authStatus: 'Authenticated',
        connectionStatus: 'Failed (Network Error)',
        sheetNameDetected: 'N/A',
        rowsRetrieved: 0,
        error: err.message || 'Network error connecting to server.',
      },
    };
  }
};

// ==========================================
// GOOGLE SHEETS API UTILITIES
// ==========================================

interface ExportResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  rowsExported: number;
}

/**
 * Export invoices list to a newly created or updated Google Sheet in user's Drive
 */
export const exportInvoicesToGoogleSheets = async (
  invoices: Invoice[],
  customTitle?: string,
  existingSpreadsheetId?: string
): Promise<ExportResult> => {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Google Workspace authentication required. Please sign in with Google first.');
  }

  const title = customTitle || `Payment Monitor - Invoice Ledger (${new Date().toISOString().split('T')[0]})`;

  let spreadsheetId = existingSpreadsheetId;
  let spreadsheetUrl = '';

  // 1. Create a new Spreadsheet if no existing ID provided
  if (!spreadsheetId) {
    const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: title,
        },
        sheets: [
          {
            properties: {
              title: 'Invoice Ledger',
              gridProperties: {
                frozenRowCount: 2,
              },
            },
          },
        ],
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Failed to create Google Sheet: ${errText}`);
    }

    const createData = await createRes.json();
    spreadsheetId = createData.spreadsheetId;
    spreadsheetUrl = createData.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  } else {
    spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  }

  // 2. Prepare Header and Data rows
  const headers = [
    'Invoice Number',
    'Supplier Name',
    'Amount (SGD)',
    'Status',
    'Approval Date',
    'Payment Terms',
    'Calculated Due Date',
    'PO Number',
    'GRN Number',
    'GRN Verified',
    'Bank Details',
    'Contact Email',
    'Needs Review',
    'Notes',
  ];

  const dataRows = invoices.map((inv) => [
    inv.invoiceNumber || '',
    inv.supplierName || '',
    inv.amount || 0,
    inv.status || 'Unpaid',
    inv.approvalDate || '',
    inv.paymentTerms || '',
    inv.calculatedDueDate || '',
    inv.poNumber || '',
    inv.grnNumber || '',
    inv.grnVerified ? 'YES' : 'NO',
    inv.bankDetails || '',
    inv.contactEmail || '',
    inv.needsReview ? 'YES' : 'NO',
    inv.notes || '',
  ]);

  const totalAmount = invoices.reduce((sum, i) => sum + (i.amount || 0), 0);

  const valuesPayload = [
    [`PAYMENT MONITOR - OFFICIAL INVOICE LEDGER (Exported: ${new Date().toLocaleString()})`],
    headers,
    ...dataRows,
    [],
    ['TOTAL INVOICE AMOUNT', '', totalAmount, `${invoices.length} TOTAL INVOICES`],
  ];

  // 3. Clear and write data to sheet
  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Invoice%20Ledger!A1:N${valuesPayload.length + 10}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: valuesPayload,
      }),
    }
  );

  if (!updateRes.ok) {
    const errText = await updateRes.text();
    throw new Error(`Failed to write data to Google Sheet: ${errText}`);
  }

  return {
    spreadsheetId,
    spreadsheetUrl,
    rowsExported: invoices.length,
  };
};

/**
 * Import invoice rows from a Google Sheet URL or ID
 */
export const importInvoicesFromGoogleSheets = async (
  sheetUrlOrId: string
): Promise<Partial<Invoice>[]> => {
  const result = await fetchGoogleSheetsWithDebug(sheetUrlOrId);
  if (!result.success) {
    throw new Error(result.error || result.debug?.error || 'Failed to read rows from Google Sheet.');
  }
  return result.invoices;
};

// ==========================================
// GOOGLE DRIVE API UTILITIES
// ==========================================

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
  iconLink?: string;
}

export interface AppendInvoiceResult {
  success: boolean;
  code?: 'SUCCESS' | 'INCOMPLETE' | 'DUPLICATE' | 'UNAUTHENTICATED' | 'SHEETS_API_ERROR' | 'SERVER_EXCEPTION';
  userMessage: string;
  error?: string;
  targetSheetName?: string;
  invoice?: Partial<Invoice>;
}

/**
 * Append an uploaded invoice directly to Google Sheet worksheet 'Payment_Complete'
 * Only allowed if the invoice is marked as Paid, to adhere strictly to the rule of not writing to other worksheets.
 */
export const appendInvoiceToGoogleSheet = async (
  invoice: Partial<Invoice>,
  spreadsheetId = TARGET_MADAM_LIM_SHEET_ID
): Promise<AppendInvoiceResult> => {
  try {
    const isPaid = invoice.status === 'Paid';
    if (!isPaid) {
      // Do not write to any other worksheets. Just return a simulated success.
      return {
        success: true,
        code: 'SUCCESS',
        userMessage: 'Invoice successfully saved locally (skipped Google Sheets append to avoid writing to non-Paid worksheets per guidelines).',
        invoice,
      };
    }

    const token = await getAccessToken();
    if (!token) {
      return {
        success: false,
        code: 'UNAUTHENTICATED',
        userMessage: 'Google Workspace authentication required. Please sign in with Google.',
        error: 'Google Workspace authentication required. Please sign in with Google.',
      };
    }

    const res = await fetch('/api/sheets/append-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spreadsheetId,
        accessToken: token,
        invoice,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        code: 'SHEETS_API_ERROR',
        userMessage: `Server Error (${res.status}): ${errText}`,
        error: `Server Error (${res.status}): ${errText}`,
      };
    }

    const data: AppendInvoiceResult = await res.json();
    return data;
  } catch (err: any) {
    console.error('Error calling /api/sheets/append-invoice:', err);
    return {
      success: false,
      code: 'SERVER_EXCEPTION',
      userMessage: `Network or server error: ${err.message || String(err)}`,
      error: err.message || String(err),
    };
  }
};

/**
 * Append an approved invoice row to Madam Lim's Payment Monitoring Google Sheet
 */
export const appendApprovedInvoiceToGoogleSheet = async (
  invoice: Invoice,
  webhookUrl?: string,
  spreadsheetId = TARGET_MADAM_LIM_SHEET_ID
): Promise<{ success: boolean; method: 'sheets_api' | 'webhook'; message: string }> => {
  const nowSingapore = new Date().toLocaleString('en-SG', { timeZone: 'Asia/Singapore' });
  const todayDateOnly = new Date().toISOString().split('T')[0];

  const lastReminder = invoice.reminders && invoice.reminders.length > 0
    ? invoice.reminders[invoice.reminders.length - 1].sentAt
    : 'None';

  const rowValues = [
    invoice.invoiceNumber || 'N/A',
    invoice.supplierName || 'N/A',
    invoice.approvalDate || todayDateOnly,
    invoice.poNumber || 'N/A',
    invoice.amount || 0,
    invoice.paymentTerms || 'Net 30',
    invoice.calculatedDueDate || invoice.fixedDueDate || 'N/A',
    'Approved by Madam Lim',
    todayDateOnly,
    invoice.notes || 'Verified & approved for payment processing',
    invoice.status || 'Paid',
    lastReminder,
    invoice.status === 'Paid' ? todayDateOnly : 'Pending',
  ];

  // Try 1: Webhook URL if provided (Google Apps Script Web App)
  const scriptUrl = webhookUrl || localStorage.getItem('madam_lim_apps_script_url');
  if (scriptUrl) {
    try {
      const res = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' }, // CORS friendly text/plain
        body: JSON.stringify({
          action: 'append_invoice',
          spreadsheetId,
          row: rowValues,
        }),
      });
      if (res.ok) {
        return {
          success: true,
          method: 'webhook',
          message: `Appended row for ${invoice.invoiceNumber} to Madam Lim's Google Sheet via Apps Script Webhook.`,
        };
      }
    } catch (err) {
      console.warn('Apps Script Webhook failed, falling back to Google Sheets API:', err);
    }
  }

  // Try 2: Direct Google Sheets API call if user is signed in with OAuth
  const token = await getAccessToken();
  if (token) {
    let targetSheetName = 'Payment_Complete';
    try {
      const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (metaRes.ok) {
        const metaData = await metaRes.json();
        const match = metaData.sheets?.find(
          (s: any) => s.properties && (Number(s.properties.sheetId) === 668977970 || s.properties.title === 'Payment_Complete')
        );
        if (match && match.properties?.title) {
          targetSheetName = match.properties.title;
        }
      }
    } catch (e) {
      console.warn('Failed to retrieve spreadsheet metadata, falling back to Payment_Complete:', e);
    }

    const appendRange = `'${targetSheetName}'!A:M`;
    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(appendRange)}:append?valueInputOption=USER_ENTERED`;
    const res = await fetch(appendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [rowValues],
      }),
    });

    if (res.ok) {
      return {
        success: true,
        method: 'sheets_api',
        message: `Appended row for ${invoice.invoiceNumber} directly to worksheet '${targetSheetName}' in Google Sheet (${spreadsheetId}).`,
      };
    } else {
      const errText = await res.text();
      throw new Error(`Google Sheets API append failed: ${errText}`);
    }
  }

  throw new Error(
    `Unable to sync to Google Sheet. Please either sign in with Google in the app or configure your Apps Script Webhook URL.`
  );
};

/**
 * List files from user's Google Drive (Spreadsheets, PDFs, Images, Excel)
 */
export const listDriveFiles = async (): Promise<DriveFileItem[]> => {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Google Workspace authentication required. Please sign in with Google first.');
  }

  const query = "trashed = false and (mimeType = 'application/vnd.google-apps.spreadsheet' or mimeType = 'application/pdf' or mimeType = 'text/csv' or mimeType contains 'sheet' or mimeType contains 'excel' or mimeType contains 'image/')";

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&pageSize=25&fields=files(id,name,mimeType,modifiedTime,webViewLink,iconLink)&orderBy=modifiedTime desc`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to list Google Drive files: ${errText}`);
  }

  const data = await res.json();
  return data.files || [];
};
