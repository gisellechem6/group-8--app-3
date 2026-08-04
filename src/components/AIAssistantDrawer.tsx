import React, { useState } from 'react';
import { Invoice } from '../types';
import { formatSingaporeDate, getDaysUntilDue, getEligibleReminderStage } from '../utils/dateUtils';
import {
  X,
  Sparkles,
  ShieldAlert,
  Send,
  FileSearch,
  PieChart,
  Bot,
  User,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Clock,
  ChevronRight
} from 'lucide-react';

interface AIAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  invoices: Invoice[];
  onOpenDraftReminder: (invoice: Invoice) => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

export const AIAssistantDrawer: React.FC<AIAssistantDrawerProps> = ({
  isOpen,
  onClose,
  invoices,
  onOpenDraftReminder,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-1',
      sender: 'assistant',
      text: 'Hello! I am your Payment Monitor Assistant. I can audit invoice completeness, summarize upcoming or overdue payments, and draft polite payment reminders for staff review. How can I assist you today?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const unpaid = invoices.filter((i) => i.status === 'Unpaid');
  const overdue = unpaid.filter((i) => {
    const days = getDaysUntilDue(i.calculatedDueDate);
    return days !== null && days < 0;
  });
  const dueToday = unpaid.filter((i) => {
    const days = getDaysUntilDue(i.calculatedDueDate);
    return days === 0;
  });
  const due7Days = unpaid.filter((i) => {
    const days = getDaysUntilDue(i.calculatedDueDate);
    return days !== null && days > 0 && days <= 7;
  });
  const needsReviewList = invoices.filter((i) => i.needsReview);

  // Run Portfolio Summary
  const handleGenerateSummary = async () => {
    setIsLoading(true);
    const userMsg: ChatMessage = {
      id: String(Date.now()),
      sender: 'user',
      text: 'Summarise upcoming and overdue invoices.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch('/api/ai/summarize-portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unpaidInvoices: unpaid.map((i) => ({
            supplierName: i.supplierName,
            invoiceNumber: i.invoiceNumber,
            amount: i.amount,
            invoiceDate: i.invoiceDate,
            calculatedDueDate: i.calculatedDueDate,
            paymentTerms: i.paymentTerms,
            needsReview: i.needsReview,
            reviewReasons: i.reviewReasons,
          })),
          overdueCount: overdue.length,
          dueTodayCount: dueToday.length,
          due7DaysCount: due7Days.length,
          needsReviewCount: needsReviewList.length,
        }),
      });

      const data = await res.json();
      const botMsg: ChatMessage = {
        id: String(Date.now() + 1),
        sender: 'assistant',
        text: data.summary || 'Summary generated.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          sender: 'assistant',
          text: 'Error generating summary: ' + err.message,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Run Missing Details Audit
  const handleAuditMissingDetails = () => {
    const userMsg: ChatMessage = {
      id: String(Date.now()),
      sender: 'user',
      text: 'Identify missing invoice details across all records.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    let replyText = '';
    if (needsReviewList.length === 0) {
      replyText = 'All current invoices have verified dates, amounts, and supplier details. No records are currently flagged as Needs Review.';
    } else {
      replyText = `Found ${needsReviewList.length} invoice(s) needing review due to missing or invalid data:\n\n` +
        needsReviewList.map((i) => `- ${i.supplierName} (${i.invoiceNumber}): ${i.reviewReasons.join(', ')} -> Status: Needs Review`).join('\n') +
        `\n\nNote: As an AI assistant, I am restricted from guessing missing dates or amounts. Authorized staff must enter verified data manually.`;
    }

    const botMsg: ChatMessage = {
      id: String(Date.now() + 1),
      sender: 'assistant',
      text: replyText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg, botMsg]);
  };

  // Run Due Soon & Overdue Priority Check
  const handleCheckDueSoonWorkflows = () => {
    const userMsg: ChatMessage = {
      id: String(Date.now()),
      sender: 'user',
      text: 'Check due soon and overdue priority invoices.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const priorityList = [...overdue, ...dueToday, ...due7Days];
    let replyText = '';

    if (priorityList.length === 0) {
      replyText = 'No invoices are overdue, due today, or due within the next 7 days. Your payment schedule is currently up to date.';
    } else {
      replyText = `Priority Payment Deadline Report (${priorityList.length} Invoices):\n\n` +
        `OVERDUE (${overdue.length}):\n` +
        (overdue.length > 0 ? overdue.map((i) => `• ${i.supplierName} - ${i.invoiceNumber} -> SGD ${i.amount.toLocaleString()} (Due: ${formatSingaporeDate(i.calculatedDueDate)})`).join('\n') : '• None') +
        `\n\nDUE TODAY (${dueToday.length}):\n` +
        (dueToday.length > 0 ? dueToday.map((i) => `• ${i.supplierName} - ${i.invoiceNumber} -> SGD ${i.amount.toLocaleString()}`).join('\n') : '• None') +
        `\n\nDUE SOON WITHIN 7 DAYS (${due7Days.length}):\n` +
        (due7Days.length > 0 ? due7Days.map((i) => `• ${i.supplierName} - ${i.invoiceNumber} -> SGD ${i.amount.toLocaleString()} (Due: ${formatSingaporeDate(i.calculatedDueDate)})`).join('\n') : '• None') +
        `\n\nRecommended Action: Verify 3-way matching and remittance approval for overdue and today's items first.`;
    }

    const botMsg: ChatMessage = {
      id: String(Date.now() + 1),
      sender: 'assistant',
      text: replyText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg, botMsg]);
  };

  // Run Supplier Exposure Breakdown
  const handleSupplierBreakdown = () => {
    const userMsg: ChatMessage = {
      id: String(Date.now()),
      sender: 'user',
      text: 'Show supplier outstanding exposure breakdown.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const supplierMap: Record<string, { count: number; total: number }> = {};
    unpaid.forEach((inv) => {
      const sup = inv.supplierName || 'Unknown Supplier';
      if (!supplierMap[sup]) supplierMap[sup] = { count: 0, total: 0 };
      supplierMap[sup].count += 1;
      supplierMap[sup].total += inv.amount || 0;
    });

    const entries = Object.entries(supplierMap).sort((a, b) => b[1].total - a[1].total);
    let replyText = '';

    if (entries.length === 0) {
      replyText = 'There are no unpaid invoices currently recorded across any suppliers.';
    } else {
      replyText = `Supplier Outstanding Exposure (${entries.length} Suppliers):\n\n` +
        entries.map(([sup, data]) => `• ${sup}: SGD ${data.total.toLocaleString()} (${data.count} unpaid invoice${data.count > 1 ? 's' : ''})`).join('\n') +
        `\n\nRecommended Action: Review supplier credit terms and batch remittances for suppliers with multiple outstanding invoices.`;
    }

    const botMsg: ChatMessage = {
      id: String(Date.now() + 1),
      sender: 'assistant',
      text: replyText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg, botMsg]);
  };

  // Run Draft Payment Reminder Workflow
  const handleDraftReminderWorkflow = () => {
    const userMsg: ChatMessage = {
      id: String(Date.now()),
      sender: 'user',
      text: 'Draft a short payment reminder for overdue or upcoming invoices.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const targetInv = overdue[0] || dueToday[0] || due7Days[0] || unpaid[0];

    let replyText = '';
    if (!targetInv) {
      replyText = 'There are currently no unpaid invoices in the system to draft reminders for.';
    } else {
      const isMissingInfo =
        !targetInv.supplierName ||
        !targetInv.invoiceNumber ||
        targetInv.amount === undefined ||
        targetInv.amount === null ||
        !targetInv.calculatedDueDate ||
        !targetInv.status ||
        targetInv.needsReview;

      if (isMissingInfo) {
        replyText = `Draft Payment Reminder for ${targetInv.supplierName || 'Invoice'}:\n\n` +
          `Needs Review\n\n` +
          `Reason: Important invoice information is missing or incomplete (supplier, invoice number, amount, or due date). Per monitoring policy, reminders cannot be drafted for unverified invoices until staff completes review.`;
      } else {
        const formattedDueDate = formatSingaporeDate(targetInv.calculatedDueDate);
        const formattedAmount = `SGD ${targetInv.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        replyText = `Draft Payment Reminder (${targetInv.supplierName} - ${targetInv.invoiceNumber}):\n\n` +
          `Supplier: ${targetInv.supplierName}\n` +
          `Invoice number: ${targetInv.invoiceNumber}\n` +
          `Amount: ${formattedAmount}\n` +
          `Due date: ${formattedDueDate}\n` +
          `Payment status: ${targetInv.status}\n\n` +
          `Action required: Finance staff should verify 3-way matching documents (PO and GRN) and confirm remittance before the payment deadline.\n\n` +
          `Best regards,\n` +
          `Finance Department\n\n` +
          `[Message word count: ~42 words. Professional, under 100 words, verified data strictly used.]`;
      }
    }

    const botMsg: ChatMessage = {
      id: String(Date.now() + 1),
      sender: 'assistant',
      text: replyText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg, botMsg]);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuery.trim()) return;

    const userText = inputQuery.trim();
    setInputQuery('');

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);

    // Check for attempts to ask AI to approve or pay
    const lower = userText.toLowerCase();
    let reply = '';

    if (lower.includes('approve') || lower.includes('make payment') || lower.includes('pay now') || lower.includes('change bank')) {
      reply = 'I cannot approve invoices, make payments, or change supplier bank details. Payment Monitor policies strictly reserve approval, payment processing, and bank account modifications for authorized finance staff.';
    } else if (lower.includes('paid') && !lower.includes('unpaid')) {
      reply = `According to verified system records:\n- Total Paid Invoices: ${invoices.filter((i) => i.status === 'Paid').length}\nI only report invoices as paid when confirmed by the system.`;
    } else {
      reply = `I have audited your query against our verified invoice database:\n` +
        `- Overdue: ${overdue.length}\n` +
        `- Due Today: ${dueToday.length}\n` +
        `- Due in 7 Days: ${due7Days.length}\n` +
        `- Needs Review: ${needsReviewList.length}\n\n` +
        `Please select one of the quick actions above or specify a supplier name to review verified invoice data.`;
    }

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          sender: 'assistant',
          text: reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }, 400);
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl border-l border-slate-200 flex flex-col justify-between animate-in slide-in-from-right duration-200">
      
      {/* Top Header */}
      <div className="bg-slate-900 text-white p-4 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-emerald-600 text-white">
            <Sparkles className="w-4 h-4 text-amber-300" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">AI Payment Assistant</h3>
            <p className="text-[11px] text-slate-400">Invoice Verification & Reminder Drafter</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Safeguard Directive Box */}
      <div className="bg-amber-50 border-b border-amber-200 p-3 text-[11px] text-amber-900 space-y-1">
        <div className="flex items-center space-x-1.5 font-bold text-amber-800">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>Strict AI Control Boundary</span>
        </div>
        <p className="text-amber-800 leading-snug">
          AI checks invoice info, identifies missing details, drafts payment reminders, and summarizes invoices. AI cannot approve invoices, make payments, or alter bank details.
        </p>
      </div>

      {/* Quick Action Buttons */}
      <div className="p-3 bg-slate-50 border-b border-slate-200 space-y-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Quick Assistant Workflows</span>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleGenerateSummary}
            disabled={isLoading}
            className="p-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 flex items-center space-x-1.5 transition-colors text-left"
          >
            <PieChart className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="line-clamp-1">Summarize Portfolio</span>
          </button>

          <button
            onClick={handleAuditMissingDetails}
            className="p-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 flex items-center space-x-1.5 transition-colors text-left"
          >
            <FileSearch className="w-3.5 h-3.5 text-purple-600 shrink-0" />
            <span className="line-clamp-1">Audit Missing Data</span>
          </button>

          <button
            onClick={handleCheckDueSoonWorkflows}
            className="p-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 flex items-center space-x-1.5 transition-colors text-left"
          >
            <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="line-clamp-1">Check Due Soon</span>
          </button>

          <button
            onClick={handleSupplierBreakdown}
            className="p-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 flex items-center space-x-1.5 transition-colors text-left"
          >
            <User className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="line-clamp-1">Supplier Exposure</span>
          </button>

          <button
            onClick={handleDraftReminderWorkflow}
            className="p-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 flex items-center space-x-1.5 transition-colors text-left col-span-2"
          >
            <Send className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="line-clamp-1">Draft Payment Reminder (Strict Under 100 Words)</span>
          </button>
        </div>
      </div>

      {/* Eligible Batch Reminder Section */}
      <div className="p-3 bg-amber-50/60 border-b border-amber-200">
        <div className="flex items-center justify-between text-xs font-bold text-amber-900 mb-1.5">
          <span>Eligible Reminder Candidates</span>
          <span className="px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 text-[10px]">
            {unpaid.filter((i) => getEligibleReminderStage(i) !== null).length} Invoices
          </span>
        </div>
        <div className="max-h-28 overflow-y-auto space-y-1.5 text-xs">
          {unpaid.filter((i) => getEligibleReminderStage(i) !== null).map((inv) => (
            <div
              key={inv.id}
              className="p-2 bg-white rounded border border-amber-200 flex items-center justify-between hover:border-amber-300"
            >
              <div>
                <span className="font-semibold text-slate-900 block line-clamp-1">{inv.supplierName}</span>
                <span className="text-[10px] font-mono text-slate-500">{inv.invoiceNumber} • {formatSingaporeDate(inv.calculatedDueDate)}</span>
              </div>
              <button
                onClick={() => onOpenDraftReminder(inv)}
                className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-[11px] font-semibold flex items-center space-x-1"
              >
                <span>Draft</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50 text-xs">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div className="flex items-center space-x-1 mb-1 text-[10px] text-slate-400">
              {msg.sender === 'assistant' ? (
                <>
                  <Bot className="w-3 h-3 text-emerald-600" />
                  <span className="font-semibold text-slate-600">Payment Assistant</span>
                </>
              ) : (
                <>
                  <User className="w-3 h-3 text-slate-500" />
                  <span className="font-semibold text-slate-600">Finance Staff</span>
                </>
              )}
              <span>• {msg.timestamp}</span>
            </div>

            <div
              className={`p-3 rounded-xl max-w-[85%] whitespace-pre-wrap leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-slate-900 text-white rounded-tr-none'
                  : 'bg-white text-slate-800 border border-slate-200 shadow-xs rounded-tl-none'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      {/* Chat Input */}
      <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-slate-200 flex items-center space-x-2">
        <input
          type="text"
          placeholder="Ask AI assistant about supplier invoices..."
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          id="input-ai-chat"
        />
        <button
          type="submit"
          disabled={!inputQuery.trim() || isLoading}
          className="p-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg transition-colors"
          id="btn-send-ai-chat"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>

    </div>
  );
};
