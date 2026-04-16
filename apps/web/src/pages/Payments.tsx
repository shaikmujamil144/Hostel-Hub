import React, { useEffect, useState } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { CreditCard, Download, CheckCircle, Clock, XCircle, Plus, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type ApiError = {
  response?: {
    data?: {
      message?: string;
    };
  };
};

interface Payment {
  _id: string;
  amount: number;
  status: 'Paid' | 'Pending' | 'Failed' | string;
  billingPeriod?: string;
  dueDate?: string;
  paymentDate?: string;
  invoiceNumber?: string;
  failureReason?: string;
  paymentMethod?: string;
  gatewayPayload?: {
    manualRequest?: {
      mode?: 'UPI' | 'Cash';
      amount?: number;
      transactionRef?: string;
      proofImageData?: string;
      note?: string;
      status?: 'Requested' | 'Approved' | 'Rejected';
      requestedAt?: string;
    };
    manualReview?: {
      decision?: 'Approve' | 'Reject';
      note?: string;
      reviewedAt?: string;
    };
  };
  user?: { name?: string };
}

interface HostelPaymentSettings {
  upiId?: string;
  upiDisplayName?: string;
  upiQrImageData?: string;
}

interface PaymentReportOverview {
  totalStudents: number;
  totalInvoices: number;
  totalRevenueCollected: number;
  paidInvoices: number;
  pendingInvoices: number;
  failedInvoices: number;
}

interface PendingRoomFee {
  roomNumber: string;
  studentName: string;
  registrationId: string;
  amount: number;
  billingPeriod: string;
  dueDate: string;
  status: string;
}

const MONTH_OPTIONS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
  'Special Fee',
];

const formatBillingPeriod = (billingPeriod?: string) => {
  if (billingPeriod && /^\d{4}-SPL-/.test(billingPeriod)) {
    const [yearText, , tokenPart] = billingPeriod.split('-');
    const prettyName = String(tokenPart || 'special-fee')
      .split('-')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    return `${prettyName || 'Special Fee'} ${yearText}`;
  }
  if (!billingPeriod || !/^\d{4}-\d{2}$/.test(billingPeriod)) return billingPeriod || 'N/A';
  const [yearText, monthText] = billingPeriod.split('-');
  const monthIndex = Number(monthText) - 1;
  if (monthIndex < 0 || monthIndex > 11) return billingPeriod;
  return `${MONTH_OPTIONS[monthIndex]} ${yearText}`;
};

const Payments: React.FC = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reviewingPaymentId, setReviewingPaymentId] = useState('');
  const [paymentRequestPayment, setPaymentRequestPayment] = useState<Payment | null>(null);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualForm, setManualForm] = useState({
    mode: '' as '' | 'UPI' | 'Cash',
    amount: 0,
    transactionRef: '',
    proofImageData: '',
    note: '',
  });
  const [reportOverview, setReportOverview] = useState<PaymentReportOverview | null>(null);
  const [paymentSettings, setPaymentSettings] = useState<HostelPaymentSettings>({});
  const [adminPaymentSettings, setAdminPaymentSettings] = useState<HostelPaymentSettings>({});
  const [savingPaymentSettings, setSavingPaymentSettings] = useState(false);
  const [pendingRoomFees, setPendingRoomFees] = useState<PendingRoomFee[]>([]);
  const [formData, setFormData] = useState({
    monthName: MONTH_OPTIONS[new Date().getMonth()],
    year: new Date().getFullYear(),
    amount: 5000,
    specialFeeName: 'Special Fee',
    dueDate: '',
    overwriteExistingPending: false,
  });
  const { userInfo } = useAuth();

  const fetchPayments = async () => {
    try {
      const { data } = await api.get('/payments', {
        params: { page, limit: 20, status: statusFilter || undefined },
      });
      setPayments(data?.data || []);
      setTotalPages(data?.pagination?.totalPages || 1);
    } catch {
      // Keep UI usable when API is unavailable
    }
  };

  const fetchPendingRoomFees = async () => {
    const role = userInfo?.role;
    if (!(role === 'Admin' || role === 'Staff')) {
      setPendingRoomFees([]);
      return;
    }

    try {
      const { data } = await api.get('/payments/pending-roomwise');
      setPendingRoomFees(data?.data || []);
    } catch {
      setPendingRoomFees([]);
    }
  };

  const fetchReportsOverview = async () => {
    if (!(userInfo?.role === 'Admin' || userInfo?.role === 'Staff')) {
      setReportOverview(null);
      return;
    }

    try {
      const { data } = await api.get('/payments/reports/overview');
      setReportOverview(data || null);
    } catch {
      setReportOverview(null);
    }
  };

  useEffect(() => {
    fetchPayments();
    fetchPendingRoomFees();
    fetchPaymentSettings();
    fetchReportsOverview();
  }, [page, statusFilter]);

  const handleGenerateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        monthName: formData.monthName,
        year: Number(formData.year),
        amount: Number(formData.amount),
        specialFeeName: formData.monthName === 'Special Fee' ? formData.specialFeeName : undefined,
        dueDate: formData.dueDate || undefined,
        overwriteExistingPending: formData.overwriteExistingPending,
      };

      const { data } = await api.post('/payments/allocate-monthly', payload);
      const totals = data?.totals || {};
      toast.success(
        `Allocated: ${totals.created || 0}, Updated: ${totals.updated || 0}, Skipped: ${totals.skipped || 0}`
      );
      setIsModalOpen(false);
      setFormData((prev) => ({
        ...prev,
        amount: 5000,
        specialFeeName: prev.specialFeeName || 'Special Fee',
        dueDate: '',
        overwriteExistingPending: false,
      }));
      fetchPayments();
      fetchPendingRoomFees();
    } catch (error: unknown) {
      const apiError = error as ApiError;
      const issues = (apiError.response?.data as any)?.issues;
      const issueMessage = Array.isArray(issues)
        ? issues.map((item: any) => item?.message).filter(Boolean).join(', ')
        : typeof issues === 'string'
        ? issues
        : '';
      toast.error(issueMessage || apiError.response?.data?.message || 'Failed to allocate monthly fee');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Paid': return <CheckCircle size={16} className="text-green-500 mr-1" />;
      case 'Pending': return <Clock size={16} className="text-yellow-500 mr-1" />;
      case 'Failed': return <XCircle size={16} className="text-red-500 mr-1" />;
      default: return null;
    }
  };

  const canManage = userInfo?.role === 'Admin' || userInfo?.role === 'Staff';
  const canAllocateMonthlyFee = userInfo?.role === 'Admin';

  const handleDownloadInvoice = async (payment: Payment) => {
    try {
      const response = await api.get(`/payments/${payment._id}/invoice`, {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${payment.invoiceNumber || `invoice-${payment._id}`}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Invoice PDF downloaded');
    } catch (error: unknown) {
      const apiError = error as ApiError;
      toast.error(apiError.response?.data?.message || 'Failed to download invoice PDF');
    }
  };

  const readFileAsDataUrl = async (file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const fetchPaymentSettings = async () => {
    try {
      const { data } = await api.get('/hostels/me/payment-settings');
      const settings = data?.paymentSettings || {};
      setPaymentSettings(settings);
      if (userInfo?.role === 'Admin') {
        setAdminPaymentSettings(settings);
      }
    } catch {
      setPaymentSettings({});
    }
  };

  const handleOpenPaymentRequest = (payment: Payment) => {
    setPaymentRequestPayment(payment);
    setManualForm({
      mode: '',
      amount: Number(payment.amount || 0),
      transactionRef: '',
      proofImageData: '',
      note: '',
    });
  };

  const handleSubmitManualRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentRequestPayment?._id) return;

    if (!manualForm.proofImageData) {
      toast.error(manualForm.mode === 'UPI' ? 'Please upload payment screenshot' : 'Please upload cash challan image');
      return;
    }

    if (!manualForm.mode) {
      toast.error('Please select UPI or Cash first');
      return;
    }

    setManualSubmitting(true);
    try {
      await api.post(`/payments/${paymentRequestPayment._id}/manual-request`, manualForm);
      toast.success('Manual payment request submitted for verification');
      setPaymentRequestPayment(null);
      fetchPayments();
    } catch (error: unknown) {
      const apiError = error as ApiError;
      toast.error(apiError.response?.data?.message || 'Unable to submit manual payment request');
    } finally {
      setManualSubmitting(false);
    }
  };

  const handleManualReview = async (paymentId: string, decision: 'Approve' | 'Reject') => {
    const note = window.prompt(
      decision === 'Approve'
        ? 'Optional note for approval:'
        : 'Reason for rejection (optional):',
      ''
    ) || '';

    setReviewingPaymentId(paymentId);
    try {
      await api.post(`/payments/${paymentId}/manual-review`, { decision, note });
      toast.success(`Manual payment ${decision === 'Approve' ? 'approved' : 'rejected'}`);
      fetchPayments();
      fetchPendingRoomFees();
    } catch (error: unknown) {
      const apiError = error as ApiError;
      toast.error(apiError.response?.data?.message || 'Unable to review manual payment');
    } finally {
      setReviewingPaymentId('');
    }
  };

  const handleProofFileChange = async (file?: File | null) => {
    if (!file) return;
    const maxBytes = 2 * 1024 * 1024;
    if (file.size > maxBytes) {
      toast.error('File size must be 2MB or below');
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setManualForm((prev) => ({ ...prev, proofImageData: dataUrl }));
    } catch {
      toast.error('Unable to read selected file');
    }
  };

  const handleAdminQrChange = async (file?: File | null) => {
    if (!file) return;
    const maxBytes = 2 * 1024 * 1024;
    if (file.size > maxBytes) {
      toast.error('QR image size must be 2MB or below');
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setAdminPaymentSettings((prev) => ({ ...prev, upiQrImageData: dataUrl }));
    } catch {
      toast.error('Unable to read QR image');
    }
  };

  const handleSavePaymentSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPaymentSettings(true);
    try {
      const { data } = await api.patch('/hostels/me/payment-settings', adminPaymentSettings);
      const next = data?.paymentSettings || {};
      setPaymentSettings(next);
      setAdminPaymentSettings(next);
      toast.success('UPI QR/payment settings updated');
    } catch (error: unknown) {
      const apiError = error as ApiError;
      toast.error(apiError.response?.data?.message || 'Failed to update payment settings');
    } finally {
      setSavingPaymentSettings(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      const response = await api.get('/payments/export', {
        params: { status: statusFilter || undefined },
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'payments.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Payments exported successfully');
    } catch (error: unknown) {
      const apiError = error as ApiError;
      toast.error(apiError.response?.data?.message || 'Failed to export payments');
    }
  };

  const handleExportPendingRoomWiseCsv = async () => {
    try {
      const response = await api.get('/payments/pending-roomwise/export', {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'pending-fees-room-wise.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Pending fee room-wise CSV exported');
    } catch (error: unknown) {
      const apiError = error as ApiError;
      toast.error(apiError.response?.data?.message || 'Failed to export pending fee CSV');
    }
  };

  const handleExportStudentMonthWiseExcel = async () => {
    try {
      const response = await api.get('/payments/reports/student-monthwise/export', {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'student-month-wise-fee-report.xlsx';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Student month-wise fee report exported');
    } catch (error: unknown) {
      const apiError = error as ApiError;
      toast.error(apiError.response?.data?.message || 'Failed to export student month-wise report');
    }
  };

  const handleExportRevenueMonthWiseExcel = async () => {
    try {
      const response = await api.get('/payments/reports/revenue-monthwise/export', {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'revenue-month-wise-report.xlsx';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Revenue month-wise report exported');
    } catch (error: unknown) {
      const apiError = error as ApiError;
      toast.error(apiError.response?.data?.message || 'Failed to export revenue month-wise report');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="flex items-center text-3xl font-extrabold text-[color:var(--hh-text)]">
          <CreditCard className="mr-3 text-amber-600 dark:text-amber-300" /> Payment & Invoices
        </h1>
        <div className="flex items-center gap-2">
          {canManage && (
            <button onClick={handleExportCsv} className="hh-btn border border-[color:var(--hh-border)] bg-transparent text-[color:var(--hh-text)] hover:bg-black/5 dark:hover:bg-white/10">
              <Download size={16} className="mr-2" /> Export CSV
            </button>
          )}
          {canManage && (
            <button onClick={handleExportStudentMonthWiseExcel} className="hh-btn border border-[color:var(--hh-border)] bg-transparent text-[color:var(--hh-text)] hover:bg-black/5 dark:hover:bg-white/10">
              <Download size={16} className="mr-2" /> Student Month-wise Excel
            </button>
          )}
          {canManage && (
            <button onClick={handleExportRevenueMonthWiseExcel} className="hh-btn border border-[color:var(--hh-border)] bg-transparent text-[color:var(--hh-text)] hover:bg-black/5 dark:hover:bg-white/10">
              <Download size={16} className="mr-2" /> Revenue Month-wise Excel
            </button>
          )}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="hh-input"
          >
            <option value="">All statuses</option>
            <option value="Pending">Pending</option>
            <option value="Paid">Paid</option>
            <option value="Failed">Failed</option>
          </select>
          {canAllocateMonthlyFee && (
            <button onClick={() => setIsModalOpen(true)} className="hh-btn-accent">
              <Plus className="w-5 h-5 mr-2" /> Allocate Monthly Fee
            </button>
          )}
        </div>
      </div>

      {userInfo?.role === 'Student' && (
        <div className="hh-surface p-4">
          <p className="text-sm text-[color:var(--hh-text)]">
            Click <strong>Pay</strong>, choose <strong>UPI</strong> or <strong>Cash</strong>, upload proof, and submit.
            Admin will verify and mark payment as done.
          </p>
        </div>
      )}

      {canManage && reportOverview && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="hh-surface p-4">
            <p className="text-xs uppercase tracking-wide hh-muted">Total Students</p>
            <p className="mt-1 text-2xl font-bold text-[color:var(--hh-text)]">{reportOverview.totalStudents}</p>
          </div>
          <div className="hh-surface p-4">
            <p className="text-xs uppercase tracking-wide hh-muted">Total Invoices</p>
            <p className="mt-1 text-2xl font-bold text-[color:var(--hh-text)]">{reportOverview.totalInvoices}</p>
          </div>
          <div className="hh-surface p-4">
            <p className="text-xs uppercase tracking-wide hh-muted">Revenue Collected</p>
            <p className="mt-1 text-2xl font-bold text-[color:var(--hh-text)]">Rs {Number(reportOverview.totalRevenueCollected || 0).toLocaleString()}</p>
          </div>
          <div className="hh-surface p-4">
            <p className="text-xs uppercase tracking-wide hh-muted">Pending Invoices</p>
            <p className="mt-1 text-2xl font-bold text-[color:var(--hh-text)]">{reportOverview.pendingInvoices}</p>
          </div>
        </div>
      )}

      {userInfo?.role === 'Admin' && (
        <div className="hh-surface p-4">
          <h2 className="mb-3 text-lg font-bold text-[color:var(--hh-text)]">UPI Payment Setup (Admin)</h2>
          <form onSubmit={handleSavePaymentSettings} className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              className="hh-input"
              placeholder="UPI ID (example: hostel@upi)"
              value={adminPaymentSettings.upiId || ''}
              onChange={(e) => setAdminPaymentSettings((prev) => ({ ...prev, upiId: e.target.value }))}
            />
            <input
              className="hh-input"
              placeholder="UPI display name"
              value={adminPaymentSettings.upiDisplayName || ''}
              onChange={(e) => setAdminPaymentSettings((prev) => ({ ...prev, upiDisplayName: e.target.value }))}
            />
            <div>
              <label className="mb-2 block text-sm font-medium text-[color:var(--hh-text)]">Upload UPI QR</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => void handleAdminQrChange(e.target.files?.[0])}
                className="hh-input"
              />
            </div>
            <div className="flex items-end">
              <button type="submit" disabled={savingPaymentSettings} className="hh-btn-primary w-full disabled:opacity-70">
                {savingPaymentSettings ? 'Saving...' : 'Save UPI Settings'}
              </button>
            </div>
          </form>

          {paymentSettings.upiQrImageData ? (
            <div className="mt-4">
              <p className="mb-2 text-sm hh-muted">Current UPI QR preview:</p>
              <img src={paymentSettings.upiQrImageData} alt="UPI QR" className="h-40 w-40 rounded-xl border border-[color:var(--hh-border)] object-cover" />
            </div>
          ) : (
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">No UPI QR uploaded yet. Students cannot use UPI request until QR is uploaded.</p>
          )}
        </div>
      )}

      <div className="hh-surface overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[color:var(--hh-border)] bg-black/5 dark:bg-white/5">
              <th className="p-4 font-semibold text-[color:var(--hh-text)]">Student Name</th>
              <th className="p-4 font-semibold text-[color:var(--hh-text)]">Fee Month</th>
              <th className="p-4 font-semibold text-[color:var(--hh-text)]">Amount</th>
              <th className="p-4 font-semibold text-[color:var(--hh-text)]">Status</th>
              <th className="p-4 font-semibold text-[color:var(--hh-text)]">Due Date</th>
              <th className="p-4 font-semibold text-[color:var(--hh-text)]">Date</th>
              <th className="p-4 text-right font-semibold text-[color:var(--hh-text)]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center hh-muted">No payment invoices found.</td></tr>
            ) : (
              payments.map((payment) => (
                <tr key={payment._id} className="border-b border-[color:var(--hh-border)]/50 hover:bg-black/5 dark:hover:bg-white/5">
                  <td className="p-4 text-[color:var(--hh-text)]">
                    <div className="font-medium">{payment.user?.name || 'Unknown'}</div>
                  </td>
                  <td className="p-4 text-sm text-[color:var(--hh-text)]">{formatBillingPeriod(payment.billingPeriod)}</td>
                  <td className="p-4 font-bold text-[color:var(--hh-text)]">₹{payment.amount}</td>
                  <td className="p-4">
                    <div className="flex items-center">
                      {getStatusIcon(payment.status)}
                      <span className="text-sm text-[color:var(--hh-text)]">{payment.status}</span>
                    </div>
                    {payment.paymentMethod ? (
                      <p className="mt-1 text-xs hh-muted">{payment.paymentMethod}</p>
                    ) : null}
                  </td>
                  <td className="p-4 hh-muted">
                    {payment.dueDate ? new Date(payment.dueDate).toLocaleDateString() : 'N/A'}
                  </td>
                  <td className="p-4 hh-muted">
                    {payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString() : 'N/A'}
                  </td>
                  <td className="p-4 text-right">
                    {payment.status === 'Paid' ? (
                      <button
                        onClick={() => handleDownloadInvoice(payment)}
                        className="hh-btn border border-[color:var(--hh-border)] bg-transparent px-3 py-1.5 text-xs text-[color:var(--hh-text)] hover:bg-black/5 dark:hover:bg-white/10"
                      >
                        <Download size={14} />
                        Invoice PDF
                      </button>
                    ) : (
                      <div className="inline-flex items-center gap-2">
                        {userInfo?.role === 'Student' ? (
                          <>
                            {payment.gatewayPayload?.manualRequest?.status === 'Requested' ? (
                              <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                                Request sent to admin
                              </span>
                            ) : (
                              <button
                                onClick={() => handleOpenPaymentRequest(payment)}
                                className="hh-btn border border-[color:var(--hh-border)] bg-transparent px-3 py-1.5 text-xs text-[color:var(--hh-text)] hover:bg-black/5 dark:hover:bg-white/10"
                              >
                                {payment.status === 'Failed' ? 'Retry Pay' : 'Pay'}
                              </button>
                            )}
                            {payment.failureReason ? (
                              <span className="text-xs text-rose-600 dark:text-rose-300">{payment.failureReason}</span>
                            ) : null}
                          </>
                        ) : canManage && payment.gatewayPayload?.manualRequest?.status === 'Requested' ? (
                          <>
                            {payment.gatewayPayload?.manualRequest?.proofImageData ? (
                              <a
                                href={payment.gatewayPayload.manualRequest.proofImageData}
                                target="_blank"
                                rel="noreferrer"
                                className="hh-btn border border-[color:var(--hh-border)] bg-transparent px-3 py-1.5 text-xs text-[color:var(--hh-text)] hover:bg-black/5 dark:hover:bg-white/10"
                              >
                                View Proof
                              </a>
                            ) : null}
                            <button
                              onClick={() => handleManualReview(payment._id, 'Approve')}
                              disabled={reviewingPaymentId === payment._id}
                              className="hh-btn-primary px-3 py-1.5 text-xs disabled:opacity-70"
                            >
                              {reviewingPaymentId === payment._id ? 'Processing...' : 'Done'}
                            </button>
                            <button
                              onClick={() => handleManualReview(payment._id, 'Reject')}
                              disabled={reviewingPaymentId === payment._id}
                              className="hh-btn-danger px-3 py-1.5 text-xs disabled:opacity-70"
                            >
                              Reject
                            </button>
                          </>
                        ) : (
                          <span className="text-xs hh-muted">Available after payment</span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {canManage && (
        <div className="hh-surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-[color:var(--hh-border)] bg-black/5 p-4 dark:bg-white/5">
            <h2 className="text-lg font-bold text-[color:var(--hh-text)]">Room-wise Pending Fee Details</h2>
            <button
              onClick={handleExportPendingRoomWiseCsv}
              className="hh-btn border border-[color:var(--hh-border)] bg-transparent text-[color:var(--hh-text)] hover:bg-black/5 dark:hover:bg-white/10"
            >
              <Download size={16} className="mr-2" /> Export Pending CSV
            </button>
          </div>

          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[color:var(--hh-border)] bg-black/5 dark:bg-white/5">
                <th className="p-4 font-semibold text-[color:var(--hh-text)]">Room Number</th>
                <th className="p-4 font-semibold text-[color:var(--hh-text)]">Student Name</th>
                <th className="p-4 font-semibold text-[color:var(--hh-text)]">Registration ID</th>
                <th className="p-4 font-semibold text-[color:var(--hh-text)]">Fee Month</th>
                <th className="p-4 font-semibold text-[color:var(--hh-text)]">Amount</th>
                <th className="p-4 font-semibold text-[color:var(--hh-text)]">Due Date</th>
                <th className="p-4 font-semibold text-[color:var(--hh-text)]">Status</th>
              </tr>
            </thead>
            <tbody>
              {pendingRoomFees.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center hh-muted">No pending fee records found.</td></tr>
              ) : (
                pendingRoomFees.map((row, index) => (
                  <tr key={`${row.roomNumber}-${row.registrationId}-${index}`} className="border-b border-[color:var(--hh-border)]/50 hover:bg-black/5 dark:hover:bg-white/5">
                    <td className="p-4 text-[color:var(--hh-text)]">{row.roomNumber || 'Unassigned'}</td>
                    <td className="p-4 text-[color:var(--hh-text)]">{row.studentName || 'Unknown'}</td>
                    <td className="p-4 text-[color:var(--hh-text)]">{row.registrationId || '-'}</td>
                    <td className="p-4 text-[color:var(--hh-text)]">{formatBillingPeriod(row.billingPeriod)}</td>
                    <td className="p-4 font-semibold text-[color:var(--hh-text)]">₹{Number(row.amount || 0).toLocaleString()}</td>
                    <td className="p-4 text-[color:var(--hh-text)]">{row.dueDate ? new Date(row.dueDate).toLocaleDateString() : 'N/A'}</td>
                    <td className="p-4 text-[color:var(--hh-text)]">{row.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          className="hh-btn border border-[color:var(--hh-border)] bg-transparent text-[color:var(--hh-text)] hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Previous
        </button>
        <span className="text-sm hh-muted">Page {page} of {totalPages}</span>
        <button
          className="hh-btn border border-[color:var(--hh-border)] bg-transparent text-[color:var(--hh-text)] hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        >
          Next
        </button>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="hh-surface w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-[color:var(--hh-text)]">Allocate Monthly Fee</h2>
              <button onClick={() => setIsModalOpen(false)} className="hh-muted hover:text-[color:var(--hh-text)]"><X size={20} /></button>
            </div>
            <form onSubmit={handleGenerateInvoice} className="space-y-4">
              <select
                value={formData.monthName}
                onChange={(e) => setFormData({ ...formData, monthName: e.target.value })}
                className="hh-input"
              >
                {MONTH_OPTIONS.map((monthName) => (
                  <option key={monthName} value={monthName}>{monthName}</option>
                ))}
              </select>
              <input
                type="number"
                placeholder="Year"
                required
                min={2020}
                max={2100}
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value || '0') || new Date().getFullYear() })}
                className="hh-input"
              />
              <input
                type="number"
                placeholder="Amount (INR)"
                required
                min={1}
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: parseInt(e.target.value || '0') || 0 })}
                className="hh-input"
              />
              {formData.monthName === 'Special Fee' && (
                <input
                  type="text"
                  placeholder="Special fee name (example: Maintenance Fee)"
                  required
                  value={formData.specialFeeName}
                  onChange={(e) => setFormData({ ...formData, specialFeeName: e.target.value })}
                  className="hh-input"
                />
              )}
              <input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                className="hh-input"
              />
              <label className="flex items-center gap-2 text-sm text-[color:var(--hh-text)]">
                <input
                  type="checkbox"
                  checked={formData.overwriteExistingPending}
                  onChange={(e) => setFormData({ ...formData, overwriteExistingPending: e.target.checked })}
                />
                Update amount for existing pending fees of the same month
              </label>
              <button type="submit" className="hh-btn-accent w-full">Allocate Fee To All Students</button>
            </form>
          </div>
        </div>
      )}

      {paymentRequestPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="hh-surface w-full max-w-md p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-[color:var(--hh-text)]">Pay Invoice</h2>
              <button onClick={() => setPaymentRequestPayment(null)} className="hh-muted hover:text-[color:var(--hh-text)]"><X size={20} /></button>
            </div>

            <p className="mb-4 text-sm hh-muted">
              Invoice: {formatBillingPeriod(paymentRequestPayment.billingPeriod)} | Amount: Rs {paymentRequestPayment.amount}
            </p>

            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setManualForm((prev) => ({ ...prev, mode: 'UPI' }))}
                className={`rounded-xl px-3 py-2 text-sm font-semibold ${manualForm.mode === 'UPI' ? 'bg-teal-500/20 text-teal-700 dark:text-teal-300' : 'border border-[color:var(--hh-border)] text-[color:var(--hh-text)]'}`}
              >
                UPI
              </button>
              <button
                type="button"
                onClick={() => setManualForm((prev) => ({ ...prev, mode: 'Cash' }))}
                className={`rounded-xl px-3 py-2 text-sm font-semibold ${manualForm.mode === 'Cash' ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300' : 'border border-[color:var(--hh-border)] text-[color:var(--hh-text)]'}`}
              >
                Cash
              </button>
            </div>

            {!manualForm.mode && (
              <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                Select payment mode first to continue.
              </p>
            )}

            {manualForm.mode === 'UPI' && (
              <div className="mb-4 rounded-xl border border-[color:var(--hh-border)] p-3">
                <p className="text-sm font-semibold text-[color:var(--hh-text)]">Scan Admin UPI QR</p>
                {paymentSettings.upiDisplayName || paymentSettings.upiId ? (
                  <p className="mt-1 text-xs hh-muted">
                    {paymentSettings.upiDisplayName || 'Hostel UPI'} {paymentSettings.upiId ? `(${paymentSettings.upiId})` : ''}
                  </p>
                ) : null}
                {paymentSettings.upiQrImageData ? (
                  <img src={paymentSettings.upiQrImageData} alt="Admin UPI QR" className="mt-3 h-44 w-44 rounded-xl border border-[color:var(--hh-border)] object-cover" />
                ) : (
                  <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">Admin has not uploaded UPI QR yet.</p>
                )}
              </div>
            )}

            <form onSubmit={handleSubmitManualRequest} className="space-y-4">
              <input
                type="number"
                className="hh-input"
                placeholder="Amount"
                min={1}
                value={manualForm.amount}
                onChange={(e) => setManualForm((prev) => ({ ...prev, amount: Number(e.target.value || 0) }))}
                required
                disabled={!manualForm.mode}
              />

              {manualForm.mode === 'UPI' && (
                <input
                  type="text"
                  className="hh-input"
                  placeholder="Enter UTR ID"
                  value={manualForm.transactionRef}
                  onChange={(e) => setManualForm((prev) => ({ ...prev, transactionRef: e.target.value }))}
                  required
                />
              )}

              <div>
                <label className="mb-2 block text-sm font-medium text-[color:var(--hh-text)]">
                  {manualForm.mode === 'UPI' ? 'Upload payment screenshot' : 'Upload cash challan'}
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handleProofFileChange(e.target.files?.[0])}
                  className="hh-input"
                  required
                  disabled={!manualForm.mode}
                />
              </div>

              <textarea
                className="hh-input h-24 resize-none"
                placeholder="Note for admin (optional)"
                value={manualForm.note}
                onChange={(e) => setManualForm((prev) => ({ ...prev, note: e.target.value }))}
                disabled={!manualForm.mode}
              />

              <button type="submit" disabled={manualSubmitting || !manualForm.mode} className="hh-btn-primary w-full disabled:opacity-70">
                {manualSubmitting ? 'Submitting...' : 'Paid - Send to Admin'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Payments;
