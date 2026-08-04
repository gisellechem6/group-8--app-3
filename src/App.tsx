import React, { useState, useMemo } from 'react';
import { Invoice, FilterOptions, DashboardMetrics, InvoiceStatus, ReminderStage } from './types';
import { initialInvoices, sampleInvoices } from './data/initialInvoices';
import { calculateDueDate, auditInvoiceData, getDaysUntilDue, formatSingaporeDate, getEligibleReminderStage, calculateThreeWayMatch } from './utils/dateUtils';
import { Navbar } from './components/Navbar';
import { Sidebar, StatusCounts } from './components/Sidebar';
import { DashboardStats } from './components/DashboardStats';
import { InvoiceList } from './components/InvoiceList';
import { InvoiceDetailModal } from './components/InvoiceDetailModal';
import { AddEditInvoiceModal } from './components/AddEditInvoiceModal';
import { ReminderReviewModal } from './components/ReminderReviewModal';
import { AIAssistantDrawer } from './components/AIAssistantDrawer';
import { DocumentExtractorModal } from './components/DocumentExtractorModal';
import { ConfirmationModal } from './components/ConfirmationModal';
import { CheckCircle, Send, BellRing, ShieldCheck, FileCheck, Check, AlertTriangle, Clock, CheckCircle2, PauseCircle, HelpCircle, FileX } from 'lucide-react';

export default function App() {
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [activeView, setActiveView] = useState<'dashboard' | 'ledger'>('dashboard');
  
  const [filters, setFilters] = useState<FilterOptions>({
    search: '',
    status: 'ALL',
    dueCategory: 'all',
    needsReviewOnly: false,
  });

  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [detailModalTab, setDetailModalTab] = useState<'details' | 'history' | 'reminders'>('details');
  const [isAddEditOpen, setIsAddEditOpen] = useState<boolean>(false);
  const [isExtractorOpen, setIsExtractorOpen] = useState<boolean>(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  
  const [reminderModalInvoice, setReminderModalInvoice] = useState<Invoice | null>(null);
  const [isAIAssistantOpen, setIsAIAssistantOpen] = useState<boolean>(false);

  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    invoice: Invoice | null;
    targetStatus: InvoiceStatus | null;
  }>({
    isOpen: false,
    invoice: null,
    targetStatus: null,
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Status Counts for Sidebar Ledger Navigation & Status Summaries
  const statusCounts: StatusCounts = useMemo(() => {
    let all = invoices.length;
    let unpaid = 0;
    let readyForPayment = 0;
    let paid = 0;
    let onHold = 0;
    let disputed = 0;
    let cancelled = 0;
    let needsReview = 0;
    let dueWithin7 = 0;
    let dueToday = 0;
    let overdue = 0;
    let totalUnpaidAmount = 0;
    let readyForPaymentAmount = 0;
    let paidAmount = 0;
    let onHoldAmount = 0;
    let disputedAmount = 0;
    let cancelledAmount = 0;

    invoices.forEach((inv) => {
      const amt = inv.amount || 0;
      if (inv.needsReview) needsReview++;
      if (inv.status === 'Paid') {
        paid++;
        paidAmount += amt;
      }
      if (inv.status === 'On Hold') {
        onHold++;
        onHoldAmount += amt;
      }
      if (inv.status === 'Disputed') {
        disputed++;
        disputedAmount += amt;
      }
      if (inv.status === 'Cancelled') {
        cancelled++;
        cancelledAmount += amt;
      }

      const match = calculateThreeWayMatch(inv);
      if (inv.status === 'Unpaid') {
        unpaid++;
        totalUnpaidAmount += amt;

        if (match.readyForPayment) {
          readyForPayment++;
          readyForPaymentAmount += amt;
        }

        if (inv.calculatedDueDate) {
          const daysLeft = getDaysUntilDue(inv.calculatedDueDate);
          if (daysLeft !== null) {
            if (daysLeft < 0) {
              overdue++;
            } else if (daysLeft === 0) {
              dueToday++;
            } else if (daysLeft <= 7) {
              dueWithin7++;
            }
          }
        }
      }
    });

    return {
      all,
      unpaid,
      readyForPayment,
      paid,
      onHold,
      disputed,
      cancelled,
      needsReview,
      dueWithin7,
      dueToday,
      overdue,
      totalUnpaidAmount,
      readyForPaymentAmount,
      paidAmount,
      onHoldAmount,
      disputedAmount,
      cancelledAmount,
    };
  }, [invoices]);

  // Compute Dashboard Metrics dynamically from current state
  const metrics: DashboardMetrics = useMemo(() => {
    let totalUnpaidCount = statusCounts.unpaid;
    let totalUnpaidAmount = statusCounts.totalUnpaidAmount;
    let dueWithin7Count = statusCounts.dueWithin7;
    let dueWithin7Amount = 0;
    let dueTodayCount = statusCounts.dueToday;
    let dueTodayAmount = 0;
    let overdueCount = statusCounts.overdue;
    let overdueAmount = 0;
    let needsReviewCount = statusCounts.needsReview;
    let readyForPaymentCount = statusCounts.readyForPayment;
    let readyForPaymentAmount = statusCounts.readyForPaymentAmount;

    invoices.forEach((inv) => {
      if (inv.status === 'Unpaid' && inv.calculatedDueDate) {
        const daysLeft = getDaysUntilDue(inv.calculatedDueDate);
        if (daysLeft !== null) {
          if (daysLeft < 0) {
            overdueAmount += inv.amount || 0;
          } else if (daysLeft === 0) {
            dueTodayAmount += inv.amount || 0;
          } else if (daysLeft <= 7) {
            dueWithin7Amount += inv.amount || 0;
          }
        }
      }
    });

    return {
      totalUnpaidCount,
      totalUnpaidAmount,
      dueWithin7Count,
      dueWithin7Amount,
      dueTodayCount,
      dueTodayAmount,
      overdueCount,
      overdueAmount,
      needsReviewCount,
      readyForPaymentCount,
      readyForPaymentAmount
    };
  }, [invoices, statusCounts]);

  const activeFilterTitle = useMemo(() => {
    if (filters.needsReviewOnly) return 'Invoices Needing Review';
    if (filters.dueCategory === 'due_within_7') return 'Due Within 7 Days';
    if (filters.dueCategory === 'due_today') return 'Invoices Due Today';
    if (filters.dueCategory === 'overdue') return 'Overdue Invoices';
    if (filters.status === 'ReadyForPayment') return 'Ready for Payment (3-Way Matched)';
    if (filters.status === 'Unpaid') return 'Unpaid Invoices';
    if (filters.status === 'Paid') return 'Paid / Settled Invoices';
    if (filters.status === 'On Hold') return 'On Hold Invoices';
    if (filters.status === 'Disputed') return 'Disputed Invoices';
    return 'All Invoices Ledger';
  }, [filters]);

  const handleSidebarFilter = (type: 'status' | 'dueCategory' | 'needsReview', val: string) => {
    if (type === 'needsReview') {
      setFilters((prev) => ({
        ...prev,
        needsReviewOnly: true,
        dueCategory: 'all',
        status: 'ALL',
      }));
    } else if (type === 'status') {
      setFilters((prev) => ({
        ...prev,
        needsReviewOnly: false,
        status: val,
        dueCategory: 'all',
      }));
    } else if (type === 'dueCategory') {
      setFilters((prev) => ({
        ...prev,
        needsReviewOnly: false,
        status: 'Unpaid',
        dueCategory: val,
      }));
    }
  };

  // Filter Invoices for display
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const match = calculateThreeWayMatch(inv);

      // Search
      if (filters.search.trim()) {
        const q = filters.search.toLowerCase();
        const matchSupplier = inv.supplierName.toLowerCase().includes(q);
        const matchNumber = inv.invoiceNumber.toLowerCase().includes(q);
        const matchNotes = (inv.notes || '').toLowerCase().includes(q);
        const matchPo = (inv.poNumber || '').toLowerCase().includes(q);
        const matchGrn = (inv.grnNumber || '').toLowerCase().includes(q);
        if (!matchSupplier && !matchNumber && !matchNotes && !matchPo && !matchGrn) return false;
      }

      // Status Pill
      if (filters.status !== 'ALL') {
        if (filters.status === 'ReadyForPayment') {
          if (!match.readyForPayment || inv.status !== 'Unpaid') return false;
        } else if (inv.status !== filters.status) {
          return false;
        }
      }

      // Needs Review toggle
      if (filters.needsReviewOnly && !inv.needsReview) {
        return false;
      }

      // Card Category Filter
      if (filters.dueCategory !== 'all') {
        if (filters.dueCategory === 'all_unpaid' && inv.status !== 'Unpaid') return false;
        if (filters.dueCategory === 'needs_review' && !inv.needsReview) return false;
        if (filters.dueCategory === 'ready_for_payment' && (!match.readyForPayment || inv.status !== 'Unpaid')) return false;

        if (inv.status === 'Unpaid' && inv.calculatedDueDate) {
          const daysLeft = getDaysUntilDue(inv.calculatedDueDate);
          if (daysLeft !== null) {
            if (filters.dueCategory === 'overdue' && daysLeft >= 0) return false;
            if (filters.dueCategory === 'due_today' && daysLeft !== 0) return false;
            if (filters.dueCategory === 'due_within_7' && (daysLeft < 0 || daysLeft > 7)) return false;
          }
        }
      }

      return true;
    });
  }, [invoices, filters]);

  // Eligible Pending Reminders List for Sidebar Queue
  const pendingReminders = useMemo(() => {
    return invoices.filter((inv) => getEligibleReminderStage(inv) !== null);
  }, [invoices]);

  // Handler: Handle Category Card Click
  const handleSelectCategoryFilter = (category: string) => {
    setFilters((prev) => ({
      ...prev,
      dueCategory: category,
      needsReviewOnly: category === 'needs_review',
      status: category === 'all_unpaid' ? 'Unpaid' : prev.status,
    }));
  };

  // Handler: Quick Mark as Paid (Triggers Confirmation Modal)
  const handleQuickMarkPaid = (invoiceId: string) => {
    const target = invoices.find((i) => i.id === invoiceId);
    if (target) {
      setConfirmModalState({
        isOpen: true,
        invoice: target,
        targetStatus: 'Paid',
      });
    }
  };

  // Handler: Quick Hold (Triggers Confirmation Modal)
  const handleQuickHold = (invoiceId: string) => {
    const target = invoices.find((i) => i.id === invoiceId);
    if (target) {
      setConfirmModalState({
        isOpen: true,
        invoice: target,
        targetStatus: 'On Hold',
      });
    }
  };

  // Handler: Prompt Confirmation for Status Change
  const handleRequestStatusChange = (invoiceId: string, newStatus: InvoiceStatus, reason?: string) => {
    const target = invoices.find((i) => i.id === invoiceId);
    if (target) {
      setConfirmModalState({
        isOpen: true,
        invoice: target,
        targetStatus: newStatus,
      });
    }
  };

  // Handler: Confirmed Status Change
  const handleConfirmStatusChange = (invoiceId: string, newStatus: InvoiceStatus, reason?: string) => {
    setInvoices((prev) =>
      prev.map((inv) => {
        if (inv.id !== invoiceId) return inv;

        const timestamp = new Date().toLocaleString('en-SG', { timeZone: 'Asia/Singapore' });
        const historyEntry = {
          id: String(Date.now()),
          timestamp,
          user: 'Giselle Chem (Staff)',
          action: `Status changed to ${newStatus}`,
          details: reason ? `Reason: ${reason}` : `Invoice status changed to ${newStatus} after staff confirmation.`,
          type: newStatus === 'On Hold' ? ('hold' as const) : ('status_change' as const),
        };

        const updated = {
          ...inv,
          status: newStatus,
          notes: reason ? `${inv.notes ? inv.notes + ' | ' : ''}Reason: ${reason}` : inv.notes,
          history: [historyEntry, ...inv.history],
        };

        if (selectedInvoice && selectedInvoice.id === invoiceId) {
          setSelectedInvoice(updated);
        }

        return updated;
      })
    );

    showToast(`Invoice status confirmed and updated to ${newStatus}.`);
  };

  // Handler: Save Invoice (Add or Edit)
  const handleSaveInvoice = (invoiceData: Partial<Invoice>) => {
    const timestamp = new Date().toLocaleString('en-SG', { timeZone: 'Asia/Singapore' });

    if (editingInvoice) {
      // Edit existing
      setInvoices((prev) =>
        prev.map((inv) => {
          if (inv.id !== editingInvoice.id) return inv;

          const historyEntry = {
            id: String(Date.now()),
            timestamp,
            user: 'Giselle Chem (Staff)',
            action: 'Invoice Details Updated',
            details: 'Supplier invoice details updated manually by staff.',
            type: 'edit' as const,
          };

          const calcDue = calculateDueDate(
            invoiceData.invoiceDate,
            invoiceData.paymentTerms || 'Net 30',
            invoiceData.fixedDueDate
          );
          const audit = auditInvoiceData({
            supplierName: invoiceData.supplierName,
            invoiceNumber: invoiceData.invoiceNumber,
            invoiceDate: invoiceData.invoiceDate,
            approvalDate: invoiceData.approvalDate,
            amount: invoiceData.amount,
            paymentTerms: invoiceData.paymentTerms,
            fixedDueDate: invoiceData.fixedDueDate,
            bankDetails: invoiceData.bankDetails,
          });

          const match = calculateThreeWayMatch({
            ...inv,
            ...invoiceData,
          });

          // If 3-way match fails and status is not Paid/Cancelled/Disputed, set status to On Hold
          let newStatus = inv.status;
          if (newStatus !== 'Paid' && newStatus !== 'Cancelled' && newStatus !== 'Disputed') {
            if (match.status !== 'Matched') {
              newStatus = 'On Hold';
            } else if (newStatus === 'On Hold') {
              newStatus = 'Unpaid';
            }
          }

          const updated: Invoice = {
            ...inv,
            ...invoiceData,
            status: newStatus,
            calculatedDueDate: calcDue,
            needsReview: audit.needsReview,
            reviewReasons: audit.reviewReasons,
            threeWayMatchStatus: match.status,
            readyForPayment: match.readyForPayment,
            history: [historyEntry, ...inv.history],
          };

          if (selectedInvoice && selectedInvoice.id === editingInvoice.id) {
            setSelectedInvoice(updated);
          }

          return updated;
        })
      );
      showToast('Supplier invoice updated successfully.');
    } else {
      // Create new
      const newId = 'inv-' + Date.now();
      const calcDue = calculateDueDate(
        invoiceData.invoiceDate,
        invoiceData.paymentTerms || 'Net 30',
        invoiceData.fixedDueDate
      );
      const audit = auditInvoiceData({
        supplierName: invoiceData.supplierName,
        invoiceNumber: invoiceData.invoiceNumber,
        invoiceDate: invoiceData.invoiceDate,
        approvalDate: invoiceData.approvalDate,
        amount: invoiceData.amount,
        paymentTerms: invoiceData.paymentTerms,
        fixedDueDate: invoiceData.fixedDueDate,
        bankDetails: invoiceData.bankDetails,
      });

      const match = calculateThreeWayMatch({
        supplierName: invoiceData.supplierName,
        invoiceNumber: invoiceData.invoiceNumber,
        invoiceDate: invoiceData.invoiceDate,
        amount: invoiceData.amount,
        poNumber: invoiceData.poNumber,
        poAmount: invoiceData.poAmount,
        grnNumber: invoiceData.grnNumber,
        grnVerified: invoiceData.grnVerified,
        needsReview: audit.needsReview,
      });

      const initialStatus: InvoiceStatus = match.status === 'Matched' ? 'Unpaid' : 'On Hold';

      const historyEntry = {
        id: String(Date.now()),
        timestamp,
        user: 'Giselle Chem (Staff)',
        action: 'Invoice Created',
        details: `Approved supplier invoice added. Three-Way Match: ${match.status}.${match.status !== 'Matched' ? ' Automatically placed On Hold.' : ''}`,
        type: match.status !== 'Matched' ? ('hold' as const) : ('creation' as const),
      };

      const newInv: Invoice = {
        id: newId,
        supplierName: invoiceData.supplierName || 'New Supplier',
        invoiceNumber: invoiceData.invoiceNumber || 'INV-DRAFT',
        invoiceDate: invoiceData.invoiceDate || '',
        approvalDate: invoiceData.approvalDate || '',
        amount: invoiceData.amount || 0,
        currency: 'SGD',
        paymentTerms: invoiceData.paymentTerms || 'Net 30',
        fixedDueDate: invoiceData.fixedDueDate,
        calculatedDueDate: calcDue,
        status: initialStatus,
        bankDetails: invoiceData.bankDetails || '',
        poNumber: invoiceData.poNumber,
        poAmount: invoiceData.poAmount,
        grnNumber: invoiceData.grnNumber,
        grnVerified: invoiceData.grnVerified,
        threeWayMatchStatus: match.status,
        readyForPayment: match.readyForPayment,
        notes: invoiceData.notes,
        contactEmail: invoiceData.contactEmail,
        needsReview: audit.needsReview,
        reviewReasons: audit.reviewReasons,
        history: [historyEntry],
        reminders: [],
      };

      setInvoices((prev) => [newInv, ...prev]);
      showToast('New approved supplier invoice registered.');
    }

    setEditingInvoice(null);
  };

  // Handler: Confirm & Send Payment Reminder
  const handleConfirmSendReminder = (
    invoiceId: string,
    subject: string,
    body: string,
    recipientEmail: string,
    triggerStage: ReminderStage
  ) => {
    const timestamp = new Date().toLocaleString('en-SG', { timeZone: 'Asia/Singapore' });

    setInvoices((prev) =>
      prev.map((inv) => {
        if (inv.id !== invoiceId) return inv;

        const newReminder = {
          id: 'rem-' + Date.now(),
          dateCreated: timestamp,
          triggerStage,
          recipientEmail,
          subject,
          body,
          status: 'Sent' as const,
          sentAt: timestamp,
          sentBy: 'Giselle Chem (Staff)',
        };

        const historyEntry = {
          id: String(Date.now()),
          timestamp,
          user: 'Giselle Chem (Staff)',
          action: 'Reminder Sent (Reviewed)',
          details: `Staff reviewed and dispatched payment reminder to ${recipientEmail}.`,
          type: 'reminder_sent' as const,
        };

        const updated = {
          ...inv,
          reminders: [newReminder, ...inv.reminders],
          history: [historyEntry, ...inv.history],
        };

        if (selectedInvoice && selectedInvoice.id === invoiceId) {
          setSelectedInvoice(updated);
        }

        return updated;
      })
    );

    showToast(`Payment reminder sent to ${recipientEmail}.`);
  };

  const formatSGD = (amount: number) => {
    return new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency: 'SGD',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans text-slate-800 overflow-hidden">
      
      {/* 1. Left Sidebar Navigation */}
      <Sidebar
        activeView={activeView}
        onSelectView={setActiveView}
        currentStatus={filters.status}
        currentDueCategory={filters.dueCategory}
        needsReviewOnly={filters.needsReviewOnly}
        statusCounts={statusCounts}
        onSelectFilter={handleSidebarFilter}
        onOpenAddModal={() => {
          setEditingInvoice(null);
          setIsAddEditOpen(true);
        }}
        onOpenExtractorModal={() => setIsExtractorOpen(true)}
        onOpenAIAssistant={() => setIsAIAssistantOpen(true)}
        onLoadSampleData={() => {
          setInvoices(sampleInvoices);
          showToast('Loaded sample demo invoices for testing.');
        }}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
      />

      {/* 2. Main Work Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        
        {/* Top Navbar Header */}
        <Navbar
          onOpenAddModal={() => {
            setEditingInvoice(null);
            setIsAddEditOpen(true);
          }}
          onOpenExtractorModal={() => setIsExtractorOpen(true)}
          onOpenAIAssistant={() => setIsAIAssistantOpen(true)}
          unpaidCount={metrics.totalUnpaidCount}
          overdueCount={metrics.overdueCount}
          needsReviewCount={metrics.needsReviewCount}
          activeFilterTitle={activeView === 'dashboard' ? 'Home Dashboard Overview' : activeFilterTitle}
        />

        {/* Dashboard Main Content */}
        <main className="flex-1 p-4 overflow-y-auto flex flex-col gap-4">
          
          {/* Streamlined Summary Strip */}
          <DashboardStats
            metrics={metrics}
            activeFilterCategory={filters.dueCategory}
            onSelectCategoryFilter={(cat) => {
              handleSelectCategoryFilter(cat);
              setActiveView('ledger');
            }}
          />

          {/* Conditional View: Home Dashboard vs Invoice Ledger */}
          {activeView === 'dashboard' ? (
            /* HOME DASHBOARD OVERVIEW VIEW (Summary of All Statuses Only) */
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 min-h-0">
              
              {/* Left Column: Complete Status Summary Grid */}
              <div className="lg:col-span-2 space-y-5">
                
                {/* Status Summary Cards Header */}
                <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 tracking-tight">Invoice Status Breakdown</h2>
                    <p className="text-xs text-slate-500">Live summary of all active, matched, pending, and settled invoice statuses</p>
                  </div>
                  <button
                    onClick={() => {
                      setActiveView('ledger');
                      setFilters((prev) => ({ ...prev, status: 'ALL', dueCategory: 'all', needsReviewOnly: false }));
                    }}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5"
                  >
                    <span>Open Full Invoice Ledger</span>
                    <span>→</span>
                  </button>
                </div>

                {/* 6 Core Status Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  
                  {/* 1. Unpaid Status Card */}
                  <div className="bg-white p-4 rounded-2xl border border-blue-200/80 shadow-2xs space-y-3 relative overflow-hidden group">
                    <div className="w-1 h-full bg-blue-500 absolute left-0 top-0"></div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                          <Clock className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Unpaid Active</h3>
                          <span className="text-[10px] text-slate-500 block">Pending settlement</span>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-blue-100 text-blue-800">
                        {statusCounts.unpaid} Invoices
                      </span>
                    </div>

                    <div className="pt-1">
                      <span className="text-2xl font-black text-slate-900 font-mono tracking-tight block">
                        {formatSGD(statusCounts.totalUnpaidAmount)}
                      </span>
                      <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                        Total outstanding balance scheduled across all payment terms.
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        setActiveView('ledger');
                        setFilters((prev) => ({ ...prev, status: 'Unpaid', dueCategory: 'all', needsReviewOnly: false }));
                      }}
                      className="w-full py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold transition-colors text-center block"
                    >
                      View Unpaid Invoices →
                    </button>
                  </div>

                  {/* 2. Ready for Payment (3-Way Matched) */}
                  <div className="bg-white p-4 rounded-2xl border border-emerald-200/80 shadow-2xs space-y-3 relative overflow-hidden">
                    <div className="w-1 h-full bg-emerald-500 absolute left-0 top-0"></div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Ready for Payment</h3>
                          <span className="text-[10px] text-emerald-600 font-semibold block">3-Way Matched (PO + GRN)</span>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800">
                        {statusCounts.readyForPayment} Verified
                      </span>
                    </div>

                    <div className="pt-1">
                      <span className="text-2xl font-black text-emerald-700 font-mono tracking-tight block">
                        {formatSGD(statusCounts.readyForPaymentAmount)}
                      </span>
                      <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                        Fully verified invoices matching PO, Goods Receipt, and unit prices.
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        setActiveView('ledger');
                        setFilters((prev) => ({ ...prev, status: 'ReadyForPayment', dueCategory: 'all', needsReviewOnly: false }));
                      }}
                      className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold transition-colors text-center block"
                    >
                      View Verified Invoices →
                    </button>
                  </div>

                  {/* 3. Needs Review Status */}
                  <div className="bg-white p-4 rounded-2xl border border-purple-200/80 shadow-2xs space-y-3 relative overflow-hidden">
                    <div className="w-1 h-full bg-purple-500 absolute left-0 top-0"></div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Needs Review</h3>
                          <span className="text-[10px] text-purple-600 font-semibold block">Missing Info Flagged</span>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-purple-100 text-purple-800">
                        {statusCounts.needsReview} Action Req.
                      </span>
                    </div>

                    <div className="pt-1">
                      <span className="text-2xl font-black text-purple-900 tracking-tight block">
                        {statusCounts.needsReview} Incomplete
                      </span>
                      <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                        Invoices flagged with missing PO numbers, bank details, or mismatched line totals.
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        setActiveView('ledger');
                        setFilters((prev) => ({ ...prev, status: 'ALL', dueCategory: 'all', needsReviewOnly: true }));
                      }}
                      className="w-full py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl text-xs font-bold transition-colors text-center block"
                    >
                      View Review Queue →
                    </button>
                  </div>

                  {/* 4. Paid / Settled Status */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3 relative overflow-hidden">
                    <div className="w-1 h-full bg-slate-400 absolute left-0 top-0"></div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center font-bold">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Paid / Settled</h3>
                          <span className="text-[10px] text-slate-500 block">Completed transactions</span>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-slate-100 text-slate-700">
                        {statusCounts.paid} Paid
                      </span>
                    </div>

                    <div className="pt-1">
                      <span className="text-2xl font-black text-slate-800 font-mono tracking-tight block">
                        {formatSGD(statusCounts.paidAmount)}
                      </span>
                      <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                        Confirmed payments settled and verified against bank statements.
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        setActiveView('ledger');
                        setFilters((prev) => ({ ...prev, status: 'Paid', dueCategory: 'all', needsReviewOnly: false }));
                      }}
                      className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors text-center block"
                    >
                      View Paid Invoices →
                    </button>
                  </div>

                  {/* 5. On Hold Status */}
                  <div className="bg-white p-4 rounded-2xl border border-amber-200/80 shadow-2xs space-y-3 relative overflow-hidden">
                    <div className="w-1 h-full bg-amber-500 absolute left-0 top-0"></div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                          <PauseCircle className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">On Hold</h3>
                          <span className="text-[10px] text-amber-600 font-semibold block">Payment paused</span>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800">
                        {statusCounts.onHold} Paused
                      </span>
                    </div>

                    <div className="pt-1">
                      <span className="text-2xl font-black text-amber-900 font-mono tracking-tight block">
                        {formatSGD(statusCounts.onHoldAmount)}
                      </span>
                      <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                        Payments temporarily held pending manager authorization or supplier clarification.
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        setActiveView('ledger');
                        setFilters((prev) => ({ ...prev, status: 'On Hold', dueCategory: 'all', needsReviewOnly: false }));
                      }}
                      className="w-full py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-bold transition-colors text-center block"
                    >
                      View On Hold →
                    </button>
                  </div>

                  {/* 6. Disputed Status */}
                  <div className="bg-white p-4 rounded-2xl border border-rose-200/80 shadow-2xs space-y-3 relative overflow-hidden">
                    <div className="w-1 h-full bg-rose-500 absolute left-0 top-0"></div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                          <HelpCircle className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Disputed</h3>
                          <span className="text-[10px] text-rose-600 font-semibold block">Under dispute</span>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800">
                        {statusCounts.disputed} Disputed
                      </span>
                    </div>

                    <div className="pt-1">
                      <span className="text-2xl font-black text-rose-900 font-mono tracking-tight block">
                        {formatSGD(statusCounts.disputedAmount)}
                      </span>
                      <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                        Invoices under dispute regarding pricing, damaged goods, or billing errors.
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        setActiveView('ledger');
                        setFilters((prev) => ({ ...prev, status: 'Disputed', dueCategory: 'all', needsReviewOnly: false }));
                      }}
                      className="w-full py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 rounded-xl text-xs font-bold transition-colors text-center block"
                    >
                      View Disputed →
                    </button>
                  </div>

                  {/* 7. Cancelled Status */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3 relative overflow-hidden">
                    <div className="w-1 h-full bg-slate-400 absolute left-0 top-0"></div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center font-bold">
                          <FileX className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Cancelled</h3>
                          <span className="text-[10px] text-slate-500 block">Voided / Nullified</span>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-slate-100 text-slate-700">
                        {statusCounts.cancelled} Cancelled
                      </span>
                    </div>

                    <div className="pt-1">
                      <span className="text-2xl font-black text-slate-700 font-mono tracking-tight block">
                        {formatSGD(statusCounts.cancelledAmount)}
                      </span>
                      <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                        Invoices explicitly voided or superseded by revised supplier billing.
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        setActiveView('ledger');
                        setFilters((prev) => ({ ...prev, status: 'Cancelled', dueCategory: 'all', needsReviewOnly: false }));
                      }}
                      className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors text-center block"
                    >
                      View Cancelled →
                    </button>
                  </div>

                </div>

                {/* Due Date Timeline Summary Card */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 tracking-tight">Due Date Timeline Summary</h3>
                      <p className="text-xs text-slate-500">Upcoming payment urgency according to Singapore (SGT) due date calculations</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      onClick={() => {
                        setActiveView('ledger');
                        setFilters((prev) => ({ ...prev, status: 'ALL', dueCategory: 'overdue', needsReviewOnly: false }));
                      }}
                      className="p-3.5 bg-rose-50/60 hover:bg-rose-50 border border-rose-200/80 rounded-xl text-left transition-all"
                    >
                      <span className="text-[10px] font-extrabold text-rose-800 uppercase tracking-wider block">Overdue Urgent</span>
                      <span className="text-xl font-black text-rose-900 font-mono mt-0.5 block">{formatSGD(metrics.overdueAmount)}</span>
                      <span className="text-[11px] font-bold text-rose-700 mt-1 block">{metrics.overdueCount} Invoices Past Due</span>
                    </button>

                    <button
                      onClick={() => {
                        setActiveView('ledger');
                        setFilters((prev) => ({ ...prev, status: 'ALL', dueCategory: 'due_today', needsReviewOnly: false }));
                      }}
                      className="p-3.5 bg-amber-50/60 hover:bg-amber-50 border border-amber-200/80 rounded-xl text-left transition-all"
                    >
                      <span className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wider block">Due Today</span>
                      <span className="text-xl font-black text-amber-900 font-mono mt-0.5 block">{formatSGD(metrics.dueTodayAmount)}</span>
                      <span className="text-[11px] font-bold text-amber-700 mt-1 block">{metrics.dueTodayCount} Invoices Maturing Today</span>
                    </button>

                    <button
                      onClick={() => {
                        setActiveView('ledger');
                        setFilters((prev) => ({ ...prev, status: 'ALL', dueCategory: 'due_within_7', needsReviewOnly: false }));
                      }}
                      className="p-3.5 bg-blue-50/60 hover:bg-blue-50 border border-blue-200/80 rounded-xl text-left transition-all"
                    >
                      <span className="text-[10px] font-extrabold text-blue-800 uppercase tracking-wider block">Due Within 7 Days</span>
                      <span className="text-xl font-black text-blue-900 font-mono mt-0.5 block">{formatSGD(metrics.dueWithin7Amount)}</span>
                      <span className="text-[11px] font-bold text-blue-700 mt-1 block">{metrics.dueWithin7Count} Invoices Approaching</span>
                    </button>
                  </div>
                </div>

              </div>

              {/* Right Column: Reminders Queue & Governance Policy */}
              <div className="space-y-4">
                
                {/* Reminders Queue Panel */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                      <BellRing className="w-4 h-4 text-amber-500" />
                      <span>Reminders Queue</span>
                    </h3>
                    <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                      {pendingReminders.length} PENDING
                    </span>
                  </div>

                  <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                    {pendingReminders.length === 0 ? (
                      <div className="text-center py-6 text-slate-400 text-xs">
                        <Check className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
                        <span>No pending reminders right now.</span>
                      </div>
                    ) : (
                      pendingReminders.map((inv) => {
                        const stage = getEligibleReminderStage(inv);
                        const daysLeft = inv.calculatedDueDate ? getDaysUntilDue(inv.calculatedDueDate) : null;

                        return (
                          <div
                            key={inv.id}
                            className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2"
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="font-bold text-slate-800 block">{inv.supplierName}</span>
                                <span className="text-[10px] font-mono text-slate-500">{inv.invoiceNumber}</span>
                              </div>
                              <span className="font-bold text-slate-900">{formatSGD(inv.amount)}</span>
                            </div>

                            <div className="flex items-center justify-between pt-1 text-[11px]">
                              <span className="text-slate-500">
                                Due: <strong className="text-slate-700">{formatSingaporeDate(inv.calculatedDueDate)}</strong>
                              </span>
                              <span className={`font-bold ${
                                daysLeft && daysLeft < 0 ? 'text-red-600' : 'text-amber-600'
                              }`}>
                                {stage}
                              </span>
                            </div>

                            <div className="pt-2 flex gap-2">
                              <button
                                onClick={() => setReminderModalInvoice(inv)}
                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1.5 px-2 rounded-lg text-[11px] flex items-center justify-center gap-1 shadow-2xs"
                              >
                                <Send className="w-3 h-3" />
                                <span>Draft Email Reminder</span>
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedInvoice(inv);
                                  setActiveView('ledger');
                                }}
                                className="px-2.5 py-1.5 text-slate-600 hover:text-slate-900 border border-slate-200 bg-white rounded-lg text-[11px] font-medium"
                              >
                                View
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Policy Governance Card */}
                <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-xs space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300 border-b border-slate-800 pb-2">
                    <ShieldCheck className="w-4 h-4 text-blue-400" />
                    <span>POLICY GOVERNANCE</span>
                  </div>

                  <ul className="space-y-2 text-xs text-slate-300">
                    <li className="flex items-start gap-2">
                      <FileCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span><strong>Manual Reminders Only:</strong> Staff must review and confirm before dispatch.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <FileCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span><strong>Code Due Calculation:</strong> Exact SGT formula for Net 7/14/30/45/60.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <FileCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span><strong>Human Bank Control:</strong> Bank details & amounts strictly staff managed.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <FileCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span><strong>Verified Data Only:</strong> Incomplete invoices marked "Needs Review".</span>
                    </li>
                  </ul>
                </div>

              </div>

            </div>
          ) : (
            /* INVOICE LEDGER TABLE VIEW */
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <InvoiceList
                invoices={filteredInvoices}
                allInvoices={invoices}
                filters={filters}
                onFilterChange={(newFilters) => setFilters((prev) => ({ ...prev, ...newFilters }))}
                onSelectInvoice={(inv, initialTab) => {
                  setDetailModalTab(initialTab || 'details');
                  setSelectedInvoice(inv);
                }}
                onOpenDraftReminder={(inv) => setReminderModalInvoice(inv)}
                onQuickMarkPaid={handleQuickMarkPaid}
                onQuickHold={handleQuickHold}
                onOpenAddModal={() => {
                  setEditingInvoice(null);
                  setIsAddEditOpen(true);
                }}
                onOpenExtractorModal={() => setIsExtractorOpen(true)}
                onLoadSampleData={() => {
                  setInvoices(sampleInvoices);
                  showToast('Loaded sample demo invoices for testing.');
                }}
              />
            </div>
          )}

        </main>

      {/* 3. Footer Bar */}
      <footer className="h-8 bg-white border-t border-slate-200 text-[11px] font-medium text-slate-500 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>SYSTEM STABLE • v2.4.1</span>
        </div>
        <div>
          © 2026 Payment Monitor Finance Controls • Singapore Time (SGT / UTC+8)
        </div>
      </footer>

      </div> {/* End main work area container */}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-12 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-slate-700 flex items-center space-x-2 text-xs font-semibold animate-in fade-in slide-in-from-bottom duration-200">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Modals & Drawers */}
      <InvoiceDetailModal
        invoice={selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        onStatusChange={handleRequestStatusChange}
        onOpenDraftReminder={(inv) => setReminderModalInvoice(inv)}
        onEditInvoice={(inv) => {
          setEditingInvoice(inv);
          setIsAddEditOpen(true);
        }}
        onInspectAI={() => setIsAIAssistantOpen(true)}
        initialTab={detailModalTab}
      />

      <ConfirmationModal
        isOpen={confirmModalState.isOpen}
        invoice={confirmModalState.invoice}
        targetStatus={confirmModalState.targetStatus}
        onClose={() => setConfirmModalState({ isOpen: false, invoice: null, targetStatus: null })}
        onConfirm={handleConfirmStatusChange}
      />

      <AddEditInvoiceModal
        isOpen={isAddEditOpen}
        invoiceToEdit={editingInvoice}
        onClose={() => {
          setIsAddEditOpen(false);
          setEditingInvoice(null);
        }}
        onSave={handleSaveInvoice}
      />

      <ReminderReviewModal
        invoice={reminderModalInvoice}
        isOpen={!!reminderModalInvoice}
        onClose={() => setReminderModalInvoice(null)}
        onConfirmSend={handleConfirmSendReminder}
      />

      <AIAssistantDrawer
        isOpen={isAIAssistantOpen}
        onClose={() => setIsAIAssistantOpen(false)}
        invoices={invoices}
        onOpenDraftReminder={(inv) => setReminderModalInvoice(inv)}
      />

      <DocumentExtractorModal
        isOpen={isExtractorOpen}
        onClose={() => setIsExtractorOpen(false)}
        onImportInvoices={(newInvoices) => {
          setInvoices((prev) => [...newInvoices, ...prev]);
          showToast(`Imported ${newInvoices.length} extracted invoices to ledger.`);
        }}
        currentUser="Giselle Chem (Staff)"
      />

    </div>
  );
}
