export type InvoiceStatus = 'Unpaid' | 'Paid' | 'On Hold' | 'Disputed' | 'Cancelled';

export type PaymentTerms = 
  | 'Due on receipt' 
  | 'Net 7' 
  | 'Net 14' 
  | 'Net 30' 
  | 'Net 45' 
  | 'Net 60' 
  | 'Fixed due date';

export type ReminderStage = 
  | '7_days_before' 
  | '3_days_before' 
  | '1_day_before' 
  | 'due_today' 
  | 'overdue';

export interface ReminderRecord {
  id: string;
  dateCreated: string; // ISO string or SGT date string
  triggerStage: ReminderStage;
  recipientEmail: string;
  subject: string;
  body: string;
  status: 'Draft' | 'Sent' | 'Dismissed';
  sentAt?: string;
  sentBy?: string;
}

export interface InvoiceHistoryEntry {
  id: string;
  timestamp: string; // SGT timestamp
  user: string;
  action: string;
  details: string;
  type: 'creation' | 'status_change' | 'edit' | 'reminder_drafted' | 'reminder_sent' | 'hold' | 'review';
}

export type ThreeWayMatchStatus = 'Matched' | 'Discrepancy' | 'Pending GRN' | 'Pending PO' | 'Needs Review';

export interface Invoice {
  id: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  approvalDate: string; // YYYY-MM-DD
  amount: number;
  currency: string; // Default SGD
  paymentTerms: PaymentTerms;
  fixedDueDate?: string; // YYYY-MM-DD if PaymentTerms === 'Fixed due date'
  calculatedDueDate: string | null; // YYYY-MM-DD or null if missing info
  status: InvoiceStatus;
  bankDetails: string;
  poNumber?: string; // Purchase Order #
  poAmount?: number; // PO Amount
  grnNumber?: string; // Goods Receipt Note #
  grnVerified?: boolean; // GRN Goods/Services verified
  threeWayMatchStatus?: ThreeWayMatchStatus;
  readyForPayment?: boolean; // True when 3-way match is 100% verified
  notes?: string;
  contactEmail?: string;
  needsReview: boolean;
  reviewReasons: string[];
  history: InvoiceHistoryEntry[];
  reminders: ReminderRecord[];
}

export interface FilterOptions {
  search: string;
  supplier?: string;
  status: string;
  dueCategory: string;
  needsReviewOnly: boolean;
  readyForPaymentOnly?: boolean;
}

export interface DashboardMetrics {
  totalUnpaidCount: number;
  totalUnpaidAmount: number;
  dueWithin7Count: number;
  dueWithin7Amount: number;
  dueTodayCount: number;
  dueTodayAmount: number;
  overdueCount: number;
  overdueAmount: number;
  needsReviewCount: number;
  readyForPaymentCount: number;
  readyForPaymentAmount: number;
}
