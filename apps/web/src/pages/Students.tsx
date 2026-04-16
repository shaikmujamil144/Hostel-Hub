import React, { useEffect, useState } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Search, Plus, X } from 'lucide-react';

type ApiError = {
  response?: {
    data?: {
      message?: string;
    };
  };
};

interface Student {
  _id: string;
  name: string;
  email: string;
  phone?: string;
}

const Students: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', password: '', phone: '' });

  const fetchStudents = async () => {
    try {
      const { data } = await api.get('/students', {
        params: { page, limit: 20, search: search || undefined },
      });
      setStudents(data?.data || []);
      setTotalPages(data?.pagination?.totalPages || 1);
    } catch {
      // Handled silently for empty initial states
    }
  };

  useEffect(() => {
    fetchStudents();
  }, [page, search]);

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/auth/register', { ...formData, role: 'Student' });
      toast.success('Student added successfully');
      setIsModalOpen(false);
      setFormData({ name: '', email: '', password: '', phone: '' });
      fetchStudents();
    } catch (error: unknown) {
      const apiError = error as ApiError;
      toast.error(apiError.response?.data?.message || 'Failed to add student');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-col md:flex-row gap-4">
        <h1 className="text-3xl font-extrabold text-[color:var(--hh-text)]">Student Management</h1>
        <div className="flex space-x-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 hh-muted w-5 h-5" />
            <input 
              type="text" 
              placeholder="Search students..." 
              value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              className="hh-input pl-10"
            />
          </div>
          <button onClick={() => setIsModalOpen(true)} className="hh-btn-primary">
            <Plus className="w-5 h-5 mr-2" /> Add Student
          </button>
        </div>
      </div>

      <div className="hh-surface overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[color:var(--hh-border)] bg-black/5 dark:bg-white/5">
              <th className="p-4 font-semibold text-[color:var(--hh-text)]">Name</th>
              <th className="p-4 font-semibold text-[color:var(--hh-text)]">Email</th>
              <th className="p-4 font-semibold text-[color:var(--hh-text)]">Phone</th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr><td colSpan={3} className="p-8 text-center hh-muted">No students found.</td></tr>
            ) : (
              students.map((student) => (
                <tr key={student._id} className="border-b border-[color:var(--hh-border)]/50 hover:bg-black/5 dark:hover:bg-white/5">
                  <td className="p-4 text-[color:var(--hh-text)]">{student.name}</td>
                  <td className="p-4 hh-muted">{student.email}</td>
                  <td className="p-4 hh-muted">{student.phone || 'N/A'}</td>
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
              <h2 className="text-xl font-bold text-[color:var(--hh-text)]">Add New Student</h2>
              <button onClick={() => setIsModalOpen(false)} className="hh-muted hover:text-[color:var(--hh-text)]"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddStudent} className="space-y-4">
              <input type="text" placeholder="Full Name" required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="hh-input" />
              <input type="email" placeholder="Email Address" required value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="hh-input" />
              <input type="password" placeholder="Temporary Password" required value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="hh-input" />
              <input type="text" placeholder="Phone Number" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} className="hh-input" />
              <button type="submit" className="hh-btn-primary w-full">Save Student</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Students;
