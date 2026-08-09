import { Invoice, PaymentTerms, ReminderStage, ThreeWayMatchStatus } from '../types';

/**
 * Returns current date string formatted as YYYY-MM-DD in Singapore time (SGT / UTC+8)
 */
export function getSingaporeTodayStr(): string {
  const now = new Date();
  // Format in SGT timezone
  const sgtString = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' }); // YYYY-MM-DD format
  return sgtString;
}

/**
 * Returns current timestamp string formatted for display in Singapore time
 */
export function getSingaporeNowFormatted(): string {
  const now = new Date();
  return now.toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Formats a YYYY-MM-DD date string into 'DD MMM YYYY' in Singapore time (e.g. '30 Jul 2026')
 */
export function formatSingaporeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Needs Review';
  
  // Parse YYYY-MM-DD safely
  const parts = dateStr.split('-');
  if (parts.length !== 3) return 'Needs Review';
  
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // 0-indexed
  const day = parseInt(parts[2], 10);
  
  if (isNaN(year) || isNaN(month) || isNaN(day)) return 'Needs Review';
  
  // Create Date object in local midnight
  const dateObj = new Date(year, month, day);
  
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayPadded = day < 10 ? `0${day}` : `${day}`;
  
  return `${dayPadded} ${months[month]} ${year}`;
}

/**
 * Calculates payment due date strictly according to rules using application code.
 * Rules:
 * - Due on receipt: invoice date
 * - Net 7, 14, 30, 45, 60: add N days to invoice date
 * - Fixed due date: date entered by staff
 * - If missing required info, return null
 */
export function calculateDueDate(
  invoiceDate: string | undefined | null,
  paymentTerms: PaymentTerms,
  fixedDueDate?: string | null
): string | null {
  if (paymentTerms === 'Fixed due date') {
    if (!fixedDueDate || fixedDueDate.trim() === '') return null;
    return fixedDueDate;
  }

  if (!invoiceDate || invoiceDate.trim() === '') return null;

  const parts = invoiceDate.split('-');
  if (parts.length !== 3) return null;
  
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

  const baseDate = new Date(year, month, day);

  let daysToAdd = 0;
  switch (paymentTerms) {
    case 'Due on receipt':
      daysToAdd = 0;
      break;
    case 'Net 7':
      daysToAdd = 7;
      break;
    case 'Net 14':
      daysToAdd = 14;
      break;
    case 'Net 30':
      daysToAdd = 30;
      break;
    case 'Net 45':
      daysToAdd = 45;
      break;
    case 'Net 60':
      daysToAdd = 60;
      break;
    default:
      return null;
  }

  baseDate.setDate(baseDate.getDate() + daysToAdd);

  const resYear = baseDate.getFullYear();
  const resMonth = String(baseDate.getMonth() + 1).padStart(2, '0');
  const resDay = String(baseDate.getDate()).padStart(2, '0');

  return `${resYear}-${resMonth}-${resDay}`;
}

/**
 * Calculates days until due from Singapore today.
 * Negative number = days overdue
 * 0 = due today
 * Positive number = days remaining
 */
export function getDaysUntilDue(dueDateStr: string | null | undefined): number | null {
  if (!dueDateStr) return null;
  
  const todayStr = getSingaporeTodayStr();
  
  const todayParts = todayStr.split('-');
  const dueParts = dueDateStr.split('-');
  
  if (todayParts.length !== 3 || dueParts.length !== 3) return null;
  
  const today = new Date(parseInt(todayParts[0], 10), parseInt(todayParts[1], 10) - 1, parseInt(todayParts[2], 10));
  const due = new Date(parseInt(dueParts[0], 10), parseInt(dueParts[1], 10) - 1, parseInt(dueParts[2], 10));
  
  const diffTime = due.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

/**
 * Validates invoice details and returns missing fields / review reasons
 */
export function auditInvoiceData(invoice: Partial<Invoice>): { needsReview: boolean; reviewReasons: string[] } {
  const reasons: string[] = [];

  if (!invoice.supplierName || invoice.supplierName.trim() === '') {
    reasons.push('Missing Supplier Name');
  }
  if (!invoice.invoiceNumber || invoice.invoiceNumber.trim() === '') {
    reasons.push('Missing Invoice Number');
  }
  if (!invoice.invoiceDate || invoice.invoiceDate.trim() === '') {
    reasons.push('Missing Invoice Date');
  }
  if (!invoice.approvalDate || invoice.approvalDate.trim() === '') {
    reasons.push('Missing Approval Date');
  }
  if (typeof invoice.amount !== 'number' || isNaN(invoice.amount) || invoice.amount <= 0) {
    reasons.push('Invalid or Missing Amount');
  }
  if (invoice.paymentTerms === 'Fixed due date' && (!invoice.fixedDueDate || invoice.fixedDueDate.trim() === '')) {
    reasons.push('Missing Fixed Due Date');
  }
  if (!invoice.bankDetails || invoice.bankDetails.trim() === '') {
    reasons.push('Missing Supplier Bank Details');
  }
  if (invoice.status === 'Ready for Payment' && (!invoice.grnNumber || invoice.grnNumber.trim() === '')) {
    reasons.push('Missing GRN Number (Required for 3-Way Match)');
  }

  const calculatedDueDate = calculateDueDate(
    invoice.invoiceDate,
    invoice.paymentTerms || 'Due on receipt',
    invoice.fixedDueDate
  );

  if (!calculatedDueDate) {
    reasons.push('Cannot Calculate Due Date');
  }

  return {
    needsReview: reasons.length > 0,
    reviewReasons: reasons
  };
}

/**
 * Returns eligible reminder stage or null
 */
export function getEligibleReminderStage(invoice: Invoice): ReminderStage | null {
  // Do not send reminders for invoices marked paid, on hold, disputed or cancelled
  if (invoice.status !== 'Unpaid') return null;
  if (invoice.needsReview || !invoice.calculatedDueDate) return null;

  const daysLeft = getDaysUntilDue(invoice.calculatedDueDate);
  if (daysLeft === null) return null;

  if (daysLeft < 0) return 'overdue';
  if (daysLeft === 0) return 'due_today';
  if (daysLeft === 1) return '1_day_before';
  if (daysLeft <= 3) return '3_days_before';
  if (daysLeft <= 7) return '7_days_before';

  return null;
}

export function getStageLabel(stage: ReminderStage): string {
  switch (stage) {
    case '7_days_before': return '7 Days Before Due';
    case '3_days_before': return '3 Days Before Due';
    case '1_day_before': return '1 Day Before Due';
    case 'due_today': return 'Due Today';
    case 'overdue': return 'Overdue';
  }
}

/**
  Evaluates Three-Way Matching (Invoice + Purchase Order + Goods Receipt Note)
 */
export function calculateThreeWayMatch(invoice: Partial<Invoice>): {
  status: ThreeWayMatchStatus;
  readyForPayment: boolean;
  matchDetails: {
    poMatched: boolean;
    grnMatched: boolean;
    amountMatched: boolean;
    reasons: string[];
  };
} {
  const reasons: string[] = [];

  const poMatched = !!(invoice.poNumber && invoice.poNumber.trim() !== '');
  const grnMatched = !!(invoice.grnNumber && invoice.grnNumber.trim() !== '' && invoice.grnVerified !== false);
  
  const amountMatched = typeof invoice.amount === 'number' && typeof invoice.poAmount === 'number'
    ? Math.abs(invoice.amount - invoice.poAmount) < 0.01
    : true; // if no poAmount recorded, assume true

  if (!poMatched) {
    reasons.push('Missing Purchase Order (PO)');
  }
  if (!grnMatched) {
    if (!invoice.grnNumber || invoice.grnNumber.trim() === '') {
      reasons.push('Missing Goods Receipt Note (GRN)');
    } else if (invoice.grnVerified === false) {
      reasons.push('GRN Goods/Services Unverified');
    }
  }
  if (!amountMatched) {
    reasons.push(`Amount mismatch: Invoice (${invoice.amount}) vs PO (${invoice.poAmount})`);
  }

  let status: ThreeWayMatchStatus = 'Matched';
  if (!poMatched && !grnMatched) {
    status = 'Needs Review';
  } else if (!poMatched) {
    status = 'Pending PO';
  } else if (!grnMatched) {
    status = 'Pending GRN';
  } else if (!amountMatched) {
    status = 'Discrepancy';
  }

  const readyForPayment = poMatched && grnMatched && amountMatched;

  return {
    status,
    readyForPayment,
    matchDetails: {
      poMatched,
      grnMatched,
      amountMatched,
      reasons,
    },
  };
}
