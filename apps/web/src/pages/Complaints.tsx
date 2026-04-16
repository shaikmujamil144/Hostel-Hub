import React, { useEffect, useState } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { MessageSquare, AlertCircle, Plus, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type ApiError = {
  response?: {
    data?: {
      message?: string;
    };
  };
};

interface Complaint {
  _id: string;
  title: string;
  description: string;
  status: 'Open' | 'InProgress' | 'Resolved';
  priorityLabel?: 'Low' | 'Medium' | 'High';
  priorityScore?: number;
  priorityFactors?: string[];
  createdAt: string;
  assignedAt?: string;
  firstResponseAt?: string;
  resolvedAt?: string;
  slaDueAt?: string;
  user?: { name?: string };
  assignedTo?: { _id: string; name?: string; role?: string };
  history?: Array<{
    action: 'Created' | 'Assigned' | 'StatusChanged' | 'Escalated';
    note?: string;
    changedAt: string;
    fromStatus?: string;
    toStatus?: string;
    changedBy?: { name?: string; role?: string };
    assignedTo?: { name?: string; role?: string };
  }>;
}

interface Assignee {
  _id: string;
  name: string;
  email: string;
  role: 'Admin' | 'Staff';
}

const Complaints: React.FC = () => {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [assignedFilter, setAssignedFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'priority'>('recent');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [assigningId, setAssigningId] = useState<string>('');
  const [formData, setFormData] = useState({ title: '', description: '' });
  const { userInfo } = useAuth();
  const canManage = userInfo?.role === 'Admin' || userInfo?.role === 'Staff';

  const fetchComplaints = async () => {
    try {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      if (assignedFilter) params.assignedTo = assignedFilter;
      if (priorityFilter) params.priority = priorityFilter;
      if (search.trim()) params.search = search.trim();
      if (sortBy === 'priority') params.sortBy = 'priority';
      if (overdueOnly) params.overdueOnly = 'true';
      const { data } = await api.get('/complaints', { params });
      setComplaints(data?.data || []);
      setTotalPages(data?.pagination?.totalPages || 1);
    } catch {
      // Mocking silently for frontend scaffold without DB
    }
  };

  const fetchAssignees = async () => {
    if (!canManage) {
      return;
    }

    try {
      const { data } = await api.get('/complaints/assignees');
      setAssignees(data);
    } catch {
      setAssignees([]);
    }
  };

  useEffect(() => {
    fetchComplaints();
  }, [statusFilter, assignedFilter, priorityFilter, search, sortBy, overdueOnly, page]);

  useEffect(() => {
    fetchAssignees();
  }, [canManage]);

  useEffect(() => {
    if (!userInfo?.hostelId) {
      return;
    }
    if (typeof io !== 'function') {
      return;
    }

    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
    const socketBase = apiBase.replace(/\/api\/?$/, '');
    const socket = io(socketBase, {
      transports: ['websocket'],
    });

    socket.emit('join_tenant', userInfo.hostelId);

    const onNewComplaint = () => {
      fetchComplaints();
    };

    const onStatusUpdated = () => {
      fetchComplaints();
      if (selectedComplaint?._id) {
        openComplaintDetails(selectedComplaint._id);
      }
    };

    const onComplaintAssigned = () => {
      fetchComplaints();
      toast.success('A complaint assignment was updated');
      if (selectedComplaint?._id) {
        openComplaintDetails(selectedComplaint._id);
      }
    };

    const onComplaintEscalated = () => {
      fetchComplaints();
      toast('Complaint escalated due to SLA breach');
      if (selectedComplaint?._id) {
        openComplaintDetails(selectedComplaint._id);
      }
    };

    socket.on('new_complaint', onNewComplaint);
    socket.on('complaint_status_updated', onStatusUpdated);
    socket.on('complaint_assigned', onComplaintAssigned);
    socket.on('complaint_escalated', onComplaintEscalated);

    return () => {
      socket.off('new_complaint', onNewComplaint);
      socket.off('complaint_status_updated', onStatusUpdated);
      socket.off('complaint_assigned', onComplaintAssigned);
      socket.off('complaint_escalated', onComplaintEscalated);
      socket.disconnect();
    };
  }, [userInfo?.hostelId, selectedComplaint?._id, statusFilter, assignedFilter]);

  const handleEscalateOverdue = async () => {
    try {
      const { data } = await api.post('/complaints/escalate-overdue');
      const escalated = Number(data?.escalated || 0);
      if (escalated > 0) {
        toast.success(`${escalated} complaint(s) escalated`);
      } else {
        toast('No overdue complaints found');
      }
      fetchComplaints();
    } catch (error: unknown) {
      const apiError = error as ApiError;
      toast.error(apiError.response?.data?.message || 'Failed to run SLA escalation');
    }
  };

  const getPriorityStyles = (priority?: 'Low' | 'Medium' | 'High') => {
    if (priority === 'High') {
      return 'bg-rose-500/15 text-rose-700 dark:text-rose-300';
    }
    if (priority === 'Medium') {
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
    }
    return 'bg-sky-500/15 text-sky-700 dark:text-sky-300';
  };

  const handleAddComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/complaints', formData);
      toast.success('Complaint submitted successfully');
      setIsModalOpen(false);
      setFormData({ title: '', description: '' });
      fetchComplaints();
    } catch (error: unknown) {
      const apiError = error as ApiError;
      toast.error(apiError.response?.data?.message || 'Failed to submit complaint');
    }
  };

  const handleStatusUpdate = async (id: string, status: string) => {
    try {
      await api.put(`/complaints/${id}`, { status });
      toast.success(`Complaint marked as ${status}`);
      fetchComplaints();
    } catch (error: unknown) {
      const apiError = error as ApiError;
      toast.error(apiError.response?.data?.message || 'Failed to update complaint');
    }
  };

  const handleAssign = async (complaintId: string, assigneeId: string) => {
    if (!assigneeId) {
      return;
    }

    try {
      setAssigningId(complaintId);
      await api.put(`/complaints/${complaintId}/assign`, { assignedTo: assigneeId });
      toast.success('Complaint assigned successfully');
      fetchComplaints();
      if (selectedComplaint?._id === complaintId) {
        await openComplaintDetails(complaintId);
      }
    } catch (error: unknown) {
      const apiError = error as ApiError;
      toast.error(apiError.response?.data?.message || 'Failed to assign complaint');
    } finally {
      setAssigningId('');
    }
  };

  const openComplaintDetails = async (id: string) => {
    try {
      const { data } = await api.get(`/complaints/${id}`);
      setSelectedComplaint(data);
    } catch (error: unknown) {
      const apiError = error as ApiError;
      toast.error(apiError.response?.data?.message || 'Failed to load complaint details');
    }
  };

  const formatDateTime = (value?: string) => {
    if (!value) {
      return 'Not available';
    }
    return new Date(value).toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="flex items-center text-3xl font-extrabold text-[color:var(--hh-text)]">
          <MessageSquare className="mr-3 text-rose-600 dark:text-rose-300" /> Live Complaints
        </h1>
        <button onClick={() => setIsModalOpen(true)} className="hh-btn-danger">
          <Plus className="w-5 h-5 mr-2" /> Report Issue
        </button>  
      </div>

      <div className="hh-surface p-4 grid grid-cols-1 md:grid-cols-6 gap-3">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search complaints"
          className="hh-input"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="hh-input"
        >
          <option value="">All statuses</option>
          <option value="Open">Open</option>
          <option value="InProgress">In Progress</option>
          <option value="Resolved">Resolved</option>
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="hh-input"
        >
          <option value="">All priorities</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'recent' | 'priority')}
          className="hh-input"
        >
          <option value="recent">Sort: Most recent</option>
          <option value="priority">Sort: Highest priority</option>
        </select>

        <label className="flex items-center gap-2 rounded-xl border border-[color:var(--hh-border)] px-3 py-2 text-sm text-[color:var(--hh-text)]">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => {
              setOverdueOnly(e.target.checked);
              setPage(1);
            }}
          />
          Overdue only
        </label>

        {canManage ? (
          <select
            value={assignedFilter}
            onChange={(e) => setAssignedFilter(e.target.value)}
            className="hh-input"
          >
            <option value="">All assignees</option>
            {assignees.map((assignee) => (
              <option key={assignee._id} value={assignee._id}>
                {assignee.name} ({assignee.role})
              </option>
            ))}
          </select>
        ) : (
          <div className="hh-muted text-sm px-3 py-2">Filters available for staff and admins.</div>
        )}

        <button
          onClick={() => {
            setStatusFilter('');
            setAssignedFilter('');
            setPriorityFilter('');
            setSearch('');
            setSortBy('recent');
            setOverdueOnly(false);
            setPage(1);
          }}
          className="hh-btn border border-[color:var(--hh-border)] bg-transparent text-[color:var(--hh-text)] hover:bg-black/5 dark:hover:bg-white/10"
        >
          Clear filters
        </button>
      </div>

      <div className="flex items-center justify-end gap-2">
        {canManage && (
          <button
            className="hh-btn-danger"
            onClick={handleEscalateOverdue}
          >
            Escalate Overdue
          </button>
        )}
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
      
      <div className="grid grid-cols-1 gap-4">
        {complaints.length === 0 ? (
          <div className="hh-surface p-8 text-center hh-muted">
            No active complaints.
          </div>
        ) : (
          complaints.map((complaint) => (
            <div key={complaint._id} className="hh-surface border-l-4 border-l-rose-500 p-6 flex flex-col md:flex-row justify-between transition-all hover:bg-black/5 dark:hover:bg-white/5">
              <div>
                <div className="flex items-center space-x-3 mb-2">
                  <h3 className="text-lg font-bold text-[color:var(--hh-text)]">{complaint.title}</h3>
                  <span className={`px-2 py-1 text-xs rounded-full font-medium ${getPriorityStyles(complaint.priorityLabel)}`}>
                    Priority {complaint.priorityLabel || 'Low'}
                  </span>
                  <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                    complaint.status === 'Open' ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300' : 
                    complaint.status === 'InProgress' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 
                    'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  }`}>
                    {complaint.status}
                  </span>
                </div>
                <p className="mb-4 hh-muted">{complaint.description}</p>
                <div className="flex items-center text-sm hh-muted">
                  <AlertCircle size={14} className="mr-1" /> Reported by {complaint.user?.name || 'Unknown'} on {new Date(complaint.createdAt).toLocaleDateString()}
                </div>
                <div className="mt-2 text-sm hh-muted">
                  Assigned to: {complaint.assignedTo?.name || 'Unassigned'}
                </div>
                <div className="mt-1 text-sm hh-muted">
                  AI score: {complaint.priorityScore ?? 10}/100
                </div>
              </div>
              <div className="mt-4 md:mt-0 flex flex-col md:items-end space-y-2">
                <button
                  onClick={() => openComplaintDetails(complaint._id)}
                  className="hh-btn border border-[color:var(--hh-border)] bg-transparent text-[color:var(--hh-text)] hover:bg-black/5 dark:hover:bg-white/10"
                >
                  View timeline
                </button>

                {canManage && (
                <div className="mt-4 md:mt-0 flex items-center space-x-2">
                  {complaint.status === 'Open' && (
                    <button onClick={() => handleStatusUpdate(complaint._id, 'InProgress')} className="hh-btn border border-[color:var(--hh-border)] bg-transparent text-[color:var(--hh-text)] hover:bg-black/5 dark:hover:bg-white/10">
                      Mark In-Progress
                    </button>
                  )}
                  {complaint.status !== 'Resolved' && (
                    <button onClick={() => handleStatusUpdate(complaint._id, 'Resolved')} className="hh-btn-primary">
                      Resolve
                    </button>
                  )}
                </div>

                )}

                {canManage && (
                  <select
                    value={assigningId === complaint._id ? '' : complaint.assignedTo?._id || ''}
                    onChange={(e) => handleAssign(complaint._id, e.target.value)}
                    className="hh-input min-w-52"
                  >
                    <option value="">Assign staff/admin</option>
                    {assignees.map((assignee) => (
                      <option key={assignee._id} value={assignee._id}>
                        {assignee.name} ({assignee.role})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="hh-surface w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-[color:var(--hh-text)]">Report New Issue</h2>
              <button onClick={() => setIsModalOpen(false)} className="hh-muted hover:text-[color:var(--hh-text)]"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddComplaint} className="space-y-4">
              <input type="text" placeholder="Issue Title (e.g., AC Not working)" required value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} className="hh-input" />
              <textarea placeholder="Describe the issue in detail..." required value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="hh-input h-32 resize-none" />
              <button type="submit" className="hh-btn-danger w-full">Submit Complaint</button>
            </form>
          </div>
        </div>
      )}

      {selectedComplaint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="hh-surface w-full max-w-2xl p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-[color:var(--hh-text)]">Complaint Timeline</h2>
              <button onClick={() => setSelectedComplaint(null)} className="hh-muted hover:text-[color:var(--hh-text)]"><X size={20} /></button>
            </div>

            <div className="space-y-2 mb-4">
              <div className="text-sm hh-muted">Title: <span className="text-[color:var(--hh-text)]">{selectedComplaint.title}</span></div>
              <div className="text-sm hh-muted">Status: <span className="text-[color:var(--hh-text)]">{selectedComplaint.status}</span></div>
              <div className="text-sm hh-muted">Priority: <span className="text-[color:var(--hh-text)]">{selectedComplaint.priorityLabel || 'Low'} ({selectedComplaint.priorityScore ?? 10}/100)</span></div>
              <div className="text-sm hh-muted">Assigned to: <span className="text-[color:var(--hh-text)]">{selectedComplaint.assignedTo?.name || 'Unassigned'}</span></div>
              <div className="text-sm hh-muted">First response: <span className="text-[color:var(--hh-text)]">{formatDateTime(selectedComplaint.firstResponseAt)}</span></div>
              <div className="text-sm hh-muted">SLA due at: <span className="text-[color:var(--hh-text)]">{formatDateTime(selectedComplaint.slaDueAt)}</span></div>
              <div className="text-sm hh-muted">Resolved at: <span className="text-[color:var(--hh-text)]">{formatDateTime(selectedComplaint.resolvedAt)}</span></div>
              <div className="text-sm hh-muted">AI factors: <span className="text-[color:var(--hh-text)]">{(selectedComplaint.priorityFactors || []).join(', ') || 'Not available'}</span></div>
            </div>

            <div className="space-y-3">
              {(selectedComplaint.history || []).length === 0 ? (
                <div className="hh-muted">No timeline events.</div>
              ) : (
                [...(selectedComplaint.history || [])]
                  .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime())
                  .map((event, idx) => (
                    <div key={`${event.changedAt}-${idx}`} className="p-3 rounded-xl border border-[color:var(--hh-border)]">
                      <div className="font-semibold text-[color:var(--hh-text)]">{event.action}</div>
                      <div className="text-sm hh-muted">{event.note || 'No note'}</div>
                      <div className="text-sm hh-muted">By {event.changedBy?.name || 'System'} at {formatDateTime(event.changedAt)}</div>
                      <div className="text-sm hh-muted">Status: {event.fromStatus || '-'} → {event.toStatus || '-'}</div>
                      {event.assignedTo?.name && (
                        <div className="text-sm hh-muted">Assigned to: {event.assignedTo.name}</div>
                      )}
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Complaints;
