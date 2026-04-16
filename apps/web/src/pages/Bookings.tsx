import React, { useEffect, useState } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { BookOpen, Plus, X } from 'lucide-react';

type ApiError = {
  response?: {
    data?: {
      message?: string;
    };
  };
};

interface Booking {
  _id: string;
  user?: { name?: string } | string;
  room?: { roomNumber?: string } | string;
  startDate: string;
  status: string;
}

const bookingUserName = (user: Booking['user']) => {
  if (typeof user === 'string') return user;
  return user?.name || 'Unknown';
};

const bookingRoomNumber = (room: Booking['room']) => {
  if (typeof room === 'string') return room;
  return room?.roomNumber || 'N/A';
};

const Bookings: React.FC = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ user: '', room: '', startDate: new Date().toISOString().split('T')[0] });

  const fetchBookings = async () => {
    try {
      const { data } = await api.get('/bookings', {
        params: { page, limit: 20, status: statusFilter || undefined },
      });
      setBookings(data?.data || []);
      setTotalPages(data?.pagination?.totalPages || 1);
    } catch {
      // Handled silently for empty start
    }
  };

  useEffect(() => {
    fetchBookings();
  }, [page, statusFilter]);

  const handleAddBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/bookings', formData);
      toast.success('Room allocated successfully');
      setIsModalOpen(false);
      setFormData({ user: '', room: '', startDate: new Date().toISOString().split('T')[0] });
      fetchBookings();
    } catch (error: unknown) {
      const apiError = error as ApiError;
      toast.error(apiError.response?.data?.message || 'Failed to allocate room');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="mb-2 flex items-center text-3xl font-extrabold text-[color:var(--hh-text)]">
          <BookOpen className="mr-3 text-teal-600 dark:text-teal-300" /> Room Allocations
        </h1>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="hh-input"
          >
            <option value="">All statuses</option>
            <option value="Active">Active</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
          <button onClick={() => setIsModalOpen(true)} className="hh-btn-primary">
            <Plus className="w-5 h-5 mr-2" /> Allocate Room
          </button>
        </div>
      </div>

      <div className="hh-surface overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[color:var(--hh-border)] bg-black/5 dark:bg-white/5">
              <th className="p-4 font-semibold text-[color:var(--hh-text)]">Student Name</th>
              <th className="p-4 font-semibold text-[color:var(--hh-text)]">Room Number</th>
              <th className="p-4 font-semibold text-[color:var(--hh-text)]">Check-in Date</th>
              <th className="p-4 font-semibold text-[color:var(--hh-text)]">Status</th>
            </tr>
          </thead>
          <tbody>
            {bookings.length === 0 ? (
              <tr><td colSpan={4} className="p-8 text-center hh-muted">No bookings found.</td></tr>
            ) : (
              bookings.map((booking) => (
                <tr key={booking._id} className="border-b border-[color:var(--hh-border)]/50 hover:bg-black/5 dark:hover:bg-white/5">
                  <td className="p-4 text-[color:var(--hh-text)]">{bookingUserName(booking.user)}</td>
                  <td className="p-4 font-medium text-teal-700 dark:text-teal-300">{bookingRoomNumber(booking.room)}</td>
                  <td className="p-4 hh-muted">{new Date(booking.startDate).toLocaleDateString()}</td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${booking.status === 'Active' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-black/10 hh-muted dark:bg-white/10'}`}>
                      {booking.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
              <h2 className="text-xl font-bold text-[color:var(--hh-text)]">Allocate Room</h2>
              <button onClick={() => setIsModalOpen(false)} className="hh-muted hover:text-[color:var(--hh-text)]"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddBooking} className="space-y-4">
              <input type="text" placeholder="Student ID (Mongo ObjectId)" required value={formData.user} onChange={(e) => setFormData({...formData, user: e.target.value})} className="hh-input" />
              <input type="text" placeholder="Room ID (Mongo ObjectId)" required value={formData.room} onChange={(e) => setFormData({...formData, room: e.target.value})} className="hh-input" />
              <input type="date" required value={formData.startDate} onChange={(e) => setFormData({...formData, startDate: e.target.value})} className="hh-input" />
              <button type="submit" className="hh-btn-primary w-full">Confirm Allocation</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Bookings;
