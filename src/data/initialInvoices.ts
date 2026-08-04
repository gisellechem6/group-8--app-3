import { Invoice } from '../types';
import { auditInvoiceData, calculateDueDate, calculateThreeWayMatch } from '../utils/dateUtils';

const baseInvoicesData: Omit<Invoice, 'needsReview' | 'reviewReasons' | 'calculatedDueDate'>[] = [
  {
    id: 'inv-1',
    supplierName: 'Singtel Enterprise Solutions',
    invoiceNumber: 'INV-2026-801',
    invoiceDate: '2026-07-01',
    approvalDate: '2026-07-03',
    amount: 4250.00,
    currency: 'SGD',
    paymentTerms: 'Net 30',
    status: 'Unpaid',
    poNumber: 'PO-2026-012',
    poAmount: 4250.00,
    grnNumber: 'GRN-2026-088',
    grnVerified: true,
    contactEmail: 'accounts@singtel.com',
    bankDetails: 'DBS Bank Ltd - A/C 003-90281-1 (Singtel Telecommunications)',
    notes: 'Monthly corporate fiber and cloud connectivity services',
    reminders: [
      {
        id: 'rem-101',
        dateCreated: '23 Jul 2026, 09:15 AM',
        triggerStage: '7_days_before',
        recipientEmail: 'accounts@singtel.com',
        subject: 'Payment Advisory: Singtel Enterprise Solutions Invoice INV-2026-801',
        body: 'Dear Accounts Team,\n\nThis is a friendly advisory regarding Invoice INV-2026-801 for SGD 4,250.00 due on 31 Jul 2026. Payment is currently scheduled for processing.\n\nThank you,\nFinance Department',
        status: 'Sent',
        sentAt: '23 Jul 2026, 09:20 AM',
        sentBy: 'Giselle Chem (Finance Officer)'
      }
    ],
    history: [
      {
        id: 'hist-1',
        timestamp: '03 Jul 2026, 11:30 AM',
        user: 'Giselle Chem',
        action: 'Invoice Created',
        details: 'Recorded approved invoice INV-2026-801 with Net 30 payment terms.',
        type: 'creation'
      }
    ]
  },
  {
    id: 'inv-2',
    supplierName: 'Marina Bay Tech Solutions',
    invoiceNumber: 'INV-2026-788',
    invoiceDate: '2026-06-25',
    approvalDate: '2026-06-28',
    amount: 12800.00,
    currency: 'SGD',
    paymentTerms: 'Net 30',
    status: 'Unpaid',
    poNumber: 'PO-2026-009',
    poAmount: 12800.00,
    grnNumber: 'GRN-2026-072',
    grnVerified: true,
    contactEmail: 'finance@marinabaytech.sg',
    bankDetails: 'OCBC Bank - A/C 687-123456-001 (Marina Bay Tech Solutions Pte Ltd)',
    notes: 'Custom ERP module development - Phase 2 milestone delivery',
    reminders: [],
    history: [
      {
        id: 'hist-3',
        timestamp: '28 Jun 2026, 02:15 PM',
        user: 'Giselle Chem',
        action: 'Invoice Created',
        details: 'Approved ERP software invoice registered.',
        type: 'creation'
      }
    ]
  },
  {
    id: 'inv-3',
    supplierName: 'Jurong Logistics Hub',
    invoiceNumber: 'INV-2026-809',
    invoiceDate: '2026-07-30',
    approvalDate: '2026-07-30',
    amount: 3150.00,
    currency: 'SGD',
    paymentTerms: 'Due on receipt',
    status: 'Unpaid',
    poNumber: 'PO-2026-020',
    poAmount: 3150.00,
    grnNumber: 'GRN-2026-105',
    grnVerified: true,
    contactEmail: 'billing@juronglogistics.com.sg',
    bankDetails: 'UOB - A/C 345-901-222-8 (Jurong Logistics Hub)',
    notes: 'Express warehousing & freight clearance for July shipment',
    reminders: [],
    history: [
      {
        id: 'hist-5',
        timestamp: '30 Jul 2026, 08:00 AM',
        user: 'Giselle Chem',
        action: 'Invoice Created',
        details: 'Due on receipt invoice registered for immediate clearance.',
        type: 'creation'
      }
    ]
  }
];

export const sampleInvoices: Invoice[] = baseInvoicesData.map((inv) => {
  const calcDue = calculateDueDate(inv.invoiceDate, inv.paymentTerms, inv.fixedDueDate);
  const audit = auditInvoiceData({
    supplierName: inv.supplierName,
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: inv.invoiceDate,
    approvalDate: inv.approvalDate,
    amount: inv.amount,
    paymentTerms: inv.paymentTerms,
    fixedDueDate: inv.fixedDueDate,
    bankDetails: inv.bankDetails
  });
  const match = calculateThreeWayMatch(inv);

  // For invoices that did not pass 3-way matching, automatically put them on hold
  let updatedStatus = inv.status;
  if (updatedStatus !== 'Paid' && updatedStatus !== 'Cancelled' && updatedStatus !== 'Disputed') {
    if (match.status !== 'Matched') {
      updatedStatus = 'On Hold';
    }
  }

  return {
    ...inv,
    calculatedDueDate: calcDue,
    needsReview: audit.needsReview,
    reviewReasons: audit.reviewReasons,
    threeWayMatchStatus: match.status,
    readyForPayment: match.readyForPayment,
    status: updatedStatus
  };
});

// Since this is a new app, default initialInvoices is empty []
export const initialInvoices: Invoice[] = [];
