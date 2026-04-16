import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { BedDouble, DoorOpen, Home, IndianRupee, MessageSquare, Users } from 'lucide-react';

interface DashboardStats {
  students: number;
  rooms: number;
  emptyRooms: number;
  revenue: number;
  complaints: number;
  totalBeds: number;
  occupiedBeds: number;
  emptyBeds: number;
  resolvedComplaints: number;
  unresolvedComplaints: number;
}

interface RevenueByMonthRow {
  month: string;
  totalAmount: number;
}

interface DashboardAnalytics {
  revenueByMonth: RevenueByMonthRow[];
}

interface HostelProfile {
  _id: string;
  name: string;
  subscriptionPlan: 'Basic' | 'Pro' | 'Enterprise';
}

interface OwnedHostel {
  _id: string;
  name: string;
  subscriptionPlan: 'Basic' | 'Pro' | 'Enterprise';
  floorsCount: number;
  totalRooms: number;
  totalBeds: number;
  referenceImages: string[];
  createdAt: string;
  deletedAt?: string;
}

interface StudentDashboardSummary {
  student: {
    _id: string;
    name: string;
    email: string;
    phone?: string;
    registrationId?: string;
  };
  room: null | {
    roomNumber: string;
    type: string;
    capacity: number;
    currentOccupancy: number;
    monthlyRent: number;
    availableBeds: number;
  };
  roommates: Array<{
    _id: string;
    name: string;
    email: string;
  }>;
  payments: {
    pendingAmount: number;
    paidAmount: number;
    pendingCount: number;
  };
  complaints: {
    open: number;
    inProgress: number;
    resolved: number;
  };
  recentComplaints: Array<{
    _id: string;
    title: string;
    status: 'Open' | 'InProgress' | 'Resolved';
    createdAt: string;
  }>;
  recentPayments: Array<{
    _id: string;
    amount: number;
    status: string;
    billingPeriod?: string;
    dueDate?: string | null;
    paymentDate: string;
    invoiceNumber?: string;
  }>;
}

type RoomDraft = {
  roomLabel: string;
  beds: number;
};

type FloorDraft = {
  floorNumber: number;
  rooms: RoomDraft[];
};

const initialStats: DashboardStats = {
  students: 0,
  rooms: 0,
  emptyRooms: 0,
  revenue: 0,
  complaints: 0,
  totalBeds: 0,
  occupiedBeds: 0,
  emptyBeds: 0,
  resolvedComplaints: 0,
  unresolvedComplaints: 0,
};

const Dashboard: React.FC = () => {
  const { userInfo, activeHostelId, setActiveHostelId } = useAuth();
  const [stats, setStats] = useState<DashboardStats>(initialStats);
  const [analytics, setAnalytics] = useState<DashboardAnalytics>({ revenueByMonth: [] });
  const [hostelProfile, setHostelProfile] = useState<HostelProfile | null>(null);

  const [ownedHostels, setOwnedHostels] = useState<OwnedHostel[]>([]);
  const [deletedHostels, setDeletedHostels] = useState<OwnedHostel[]>([]);

  const [hostelName, setHostelName] = useState('');
  const [hostelPlan, setHostelPlan] = useState<'Basic' | 'Pro' | 'Enterprise'>('Basic');
  const [hostelFloors, setHostelFloors] = useState<FloorDraft[]>([{ floorNumber: 1, rooms: [{ roomLabel: 'F1-R1', beds: 2 }] }]);
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const [isCreatingHostel, setIsCreatingHostel] = useState(false);
  const [hostelCreateMessage, setHostelCreateMessage] = useState('');
  const [editingHostelId, setEditingHostelId] = useState<string | null>(null);
  const [studentSummary, setStudentSummary] = useState<StudentDashboardSummary | null>(null);

  const isAdminWithoutHostelSelection = userInfo?.role === 'Admin' && !activeHostelId;

  const refreshOwnedHostelLists = async () => {
    if (userInfo?.role !== 'Admin') return;
    try {
      const [ownedRes, deletedRes] = await Promise.all([
        api.get('/hostels/owned'),
        api.get('/hostels/owned/recycle-bin'),
      ]);
      setOwnedHostels(ownedRes.data?.items || []);
      setDeletedHostels(deletedRes.data?.items || []);
    } catch {
      setOwnedHostels([]);
      setDeletedHostels([]);
    }
  };

  useEffect(() => {
    const load = async () => {
      if (!userInfo?.token) return;

      if (userInfo.role === 'Student') {
        try {
          const { data } = await api.get('/dashboard/student-summary');
          setStudentSummary(data || null);
        } catch {
          setStudentSummary(null);
        }
        return;
      }

      if (userInfo.role === 'Admin') {
        await refreshOwnedHostelLists();
      }

      if (userInfo.role === 'Admin' && !activeHostelId) {
        setStats(initialStats);
        setAnalytics({ revenueByMonth: [] });
        setHostelProfile(null);
        return;
      }

      try {
        const { data } = await api.get('/dashboard/stats');
        setStats({ ...initialStats, ...data });
      } catch {
        setStats(initialStats);
      }

      try {
        const { data } = await api.get('/dashboard/analytics');
        setAnalytics({ revenueByMonth: data?.revenueByMonth || [] });
      } catch {
        setAnalytics({ revenueByMonth: [] });
      }

      try {
        const { data } = await api.get('/hostels/me');
        setHostelProfile(data || null);
      } catch {
        setHostelProfile(null);
      }
    };

    load();
  }, [userInfo?.token, userInfo?.role, activeHostelId]);

  const toDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });

  const addFloor = () => {
    const nextFloorNumber = hostelFloors.length + 1;
    setHostelFloors((prev) => [
      ...prev,
      {
        floorNumber: nextFloorNumber,
        rooms: [{ roomLabel: `F${nextFloorNumber}-R1`, beds: 2 }],
      },
    ]);
  };

  const removeFloor = (floorIndex: number) => {
    setHostelFloors((prev) =>
      prev
        .filter((_, idx) => idx !== floorIndex)
        .map((floor, idx) => ({ ...floor, floorNumber: idx + 1 }))
    );
  };

  const addRoom = (floorIndex: number) => {
    setHostelFloors((prev) =>
      prev.map((floor, idx) => {
        if (idx !== floorIndex) return floor;
        const nextRoomNo = floor.rooms.length + 1;
        return {
          ...floor,
          rooms: [...floor.rooms, { roomLabel: `F${floor.floorNumber}-R${nextRoomNo}`, beds: 2 }],
        };
      })
    );
  };

  const removeRoom = (floorIndex: number, roomIndex: number) => {
    setHostelFloors((prev) =>
      prev.map((floor, idx) => {
        if (idx !== floorIndex) return floor;
        if (floor.rooms.length <= 1) return floor;
        return {
          ...floor,
          rooms: floor.rooms.filter((_, ridx) => ridx !== roomIndex),
        };
      })
    );
  };

  const updateRoom = (floorIndex: number, roomIndex: number, patch: Partial<RoomDraft>) => {
    setHostelFloors((prev) =>
      prev.map((floor, idx) => {
        if (idx !== floorIndex) return floor;
        return {
          ...floor,
          rooms: floor.rooms.map((room, ridx) => (ridx === roomIndex ? { ...room, ...patch } : room)),
        };
      })
    );
  };

  const createOrUpdateHostel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostelName.trim()) {
      setHostelCreateMessage('Hostel name is required.');
      return;
    }

    setIsCreatingHostel(true);
    setHostelCreateMessage(editingHostelId ? 'Updating hostel...' : 'Creating hostel...');

    try {
      const referenceImages = await Promise.all(referenceFiles.slice(0, 5).map((file) => toDataUrl(file)));

      const payload = {
        name: hostelName.trim(),
        subscriptionPlan: hostelPlan,
        floors: hostelFloors.map((floor) => ({
          floorNumber: floor.floorNumber,
          rooms: floor.rooms.map((room, roomIdx) => ({
            roomLabel: room.roomLabel.trim() || `F${floor.floorNumber}-R${roomIdx + 1}`,
            beds: Math.max(1, Number(room.beds) || 1),
          })),
        })),
        referenceImages,
      };

      if (editingHostelId) {
        await api.patch(`/hostels/${editingHostelId}`, payload);
        setHostelCreateMessage('Hostel updated successfully.');
      } else {
        await api.post('/hostels', payload);
        setHostelCreateMessage('Hostel created successfully.');
      }

      setHostelName('');
      setHostelPlan('Basic');
      setHostelFloors([{ floorNumber: 1, rooms: [{ roomLabel: 'F1-R1', beds: 2 }] }]);
      setReferenceFiles([]);
      setEditingHostelId(null);

      await refreshOwnedHostelLists();
    } catch (error: unknown) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        typeof (error as { response?: { data?: { message?: string } } }).response?.data?.message === 'string'
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : 'Failed to save hostel.';
      setHostelCreateMessage(message || 'Failed to save hostel.');
    } finally {
      setIsCreatingHostel(false);
    }
  };

  const startEditHostel = async (hostelId: string) => {
    try {
      setHostelCreateMessage('Loading hostel details...');
      const { data } = await api.get(`/hostels/${hostelId}`);
      setEditingHostelId(hostelId);
      setHostelName(data?.name || '');
      setHostelPlan(data?.subscriptionPlan || 'Basic');

      const incomingFloors = Array.isArray(data?.floors)
        ? data.floors.map((floor: any, idx: number) => ({
            floorNumber: Number(floor.floorNumber) || idx + 1,
            rooms: Array.isArray(floor.rooms)
              ? floor.rooms.map((room: any, ridx: number) => ({
                  roomLabel: String(room.roomLabel || `F${idx + 1}-R${ridx + 1}`),
                  beds: Math.max(1, Number(room.beds) || 1),
                }))
              : [{ roomLabel: `F${idx + 1}-R1`, beds: 1 }],
          }))
        : [];

      setHostelFloors(
        incomingFloors.length > 0
          ? incomingFloors
          : [{ floorNumber: 1, rooms: [{ roomLabel: 'F1-R1', beds: 2 }] }]
      );
      setReferenceFiles([]);
      setHostelCreateMessage('Edit mode enabled.');
    } catch {
      setHostelCreateMessage('Failed to load hostel for editing.');
    }
  };

  const cancelEditHostel = () => {
    setEditingHostelId(null);
    setHostelName('');
    setHostelPlan('Basic');
    setHostelFloors([{ floorNumber: 1, rooms: [{ roomLabel: 'F1-R1', beds: 2 }] }]);
    setReferenceFiles([]);
    setHostelCreateMessage('');
  };

  const moveToRecycleBin = async (hostelId: string) => {
    if (!window.confirm('Move this hostel to recycle bin?')) return;

    try {
      await api.delete(`/hostels/${hostelId}`);
      if (activeHostelId === hostelId) {
        setActiveHostelId(null);
      }
      if (editingHostelId === hostelId) {
        cancelEditHostel();
      }
      await refreshOwnedHostelLists();
      setHostelCreateMessage('Hostel moved to recycle bin.');
    } catch {
      setHostelCreateMessage('Failed to delete hostel.');
    }
  };

  const restoreFromRecycleBin = async (hostelId: string) => {
    try {
      await api.patch(`/hostels/${hostelId}/restore`);
      await refreshOwnedHostelLists();
      setHostelCreateMessage('Hostel restored from recycle bin.');
    } catch {
      setHostelCreateMessage('Failed to restore hostel.');
    }
  };

  const permanentlyDeleteHostel = async (hostelId: string) => {
    if (!window.confirm('This will permanently delete the hostel and related data. Continue?')) return;

    try {
      await api.delete(`/hostels/${hostelId}/permanent`);
      await refreshOwnedHostelLists();
      setHostelCreateMessage('Hostel permanently deleted.');
    } catch {
      setHostelCreateMessage('Failed to permanently delete hostel.');
    }
  };

  const openHostelDashboard = (hostelId: string) => {
    setActiveHostelId(hostelId);
    setHostelCreateMessage('Hostel selected. Dashboard loaded for selected hostel only.');
  };

  const changeHostel = () => {
    setActiveHostelId(null);
  };

  const maxRevenue = useMemo(
    () => Math.max(...analytics.revenueByMonth.map((item) => item.totalAmount), 1),
    [analytics.revenueByMonth]
  );

  const cards = [
    { title: 'Total Rooms', value: stats.rooms, icon: Home, tone: 'from-cyan-500/20 to-blue-400/10 text-cyan-700 dark:text-cyan-300' },
    { title: 'Completely Empty Rooms', value: stats.emptyRooms, icon: DoorOpen, tone: 'from-emerald-500/20 to-lime-400/10 text-emerald-700 dark:text-emerald-300' },
    { title: 'Students', value: stats.students, icon: Users, tone: 'from-teal-500/20 to-emerald-400/10 text-teal-700 dark:text-teal-300' },
    { title: 'Total Beds', value: stats.totalBeds, icon: BedDouble, tone: 'from-indigo-500/20 to-sky-400/10 text-indigo-700 dark:text-indigo-300' },
    { title: 'Occupied Beds', value: stats.occupiedBeds, icon: BedDouble, tone: 'from-violet-500/20 to-fuchsia-400/10 text-violet-700 dark:text-violet-300' },
    { title: 'Monthly Revenue', value: stats.revenue, icon: IndianRupee, tone: 'from-amber-500/20 to-orange-400/10 text-amber-700 dark:text-amber-300', prefix: '₹' },
    { title: 'Open Complaints', value: stats.complaints, icon: MessageSquare, tone: 'from-rose-500/20 to-red-400/10 text-rose-700 dark:text-rose-300' },
  ];

  if (userInfo?.role === 'Student') {
    return (
      <div className="space-y-6">
        <div className="hh-surface p-6">
          <h1 className="text-3xl font-extrabold text-[color:var(--hh-text)]">My Student Dashboard</h1>
          <p className="mt-2 text-sm hh-muted">Student details, roommate info, fee details, and payment history.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="hh-card p-4">
            <p className="text-sm hh-muted">Student Name</p>
            <p className="mt-1 text-2xl font-extrabold text-[color:var(--hh-text)]">{studentSummary?.student?.name || '-'}</p>
          </div>
          <div className="hh-card p-4">
            <p className="text-sm hh-muted">My Room</p>
            <p className="mt-1 text-2xl font-extrabold text-[color:var(--hh-text)]">
              {studentSummary?.room?.roomNumber || 'Not Allocated'}
            </p>
          </div>
          <div className="hh-card p-4">
            <p className="text-sm hh-muted">Monthly Rent</p>
            <p className="mt-1 text-2xl font-extrabold text-[color:var(--hh-text)]">
              ₹{Number(studentSummary?.room?.monthlyRent || 0).toLocaleString()}
            </p>
          </div>
          <div className="hh-card p-4">
            <p className="text-sm hh-muted">Pending Fee</p>
            <p className="mt-1 text-2xl font-extrabold text-rose-600 dark:text-rose-400">
              ₹{Number(studentSummary?.payments?.pendingAmount || 0).toLocaleString()}
            </p>
          </div>
          <div className="hh-card p-4">
            <p className="text-sm hh-muted">Paid Total</p>
            <p className="mt-1 text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
              ₹{Number(studentSummary?.payments?.paidAmount || 0).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="hh-surface p-6">
            <h2 className="text-xl font-bold text-[color:var(--hh-text)]">Student Details</h2>
            <div className="mt-3 space-y-2 text-sm">
              <p className="hh-muted">Email: <span className="font-semibold text-[color:var(--hh-text)]">{studentSummary?.student?.email || '-'}</span></p>
              <p className="hh-muted">Phone: <span className="font-semibold text-[color:var(--hh-text)]">{studentSummary?.student?.phone || '-'}</span></p>
              <p className="hh-muted">Registration ID: <span className="font-semibold text-[color:var(--hh-text)]">{studentSummary?.student?.registrationId || '-'}</span></p>
            </div>
          </div>

          <div className="hh-surface p-6">
            <h2 className="text-xl font-bold text-[color:var(--hh-text)]">Room & Roommate Details</h2>
            {!studentSummary?.room ? (
              <p className="mt-3 text-sm hh-muted">You are not allocated to a room yet.</p>
            ) : (
              <div className="mt-3 space-y-3 text-sm">
                <p className="hh-muted">Room Number: <span className="font-semibold text-[color:var(--hh-text)]">{studentSummary.room.roomNumber}</span></p>
                <p className="hh-muted">Type: <span className="font-semibold text-[color:var(--hh-text)]">{studentSummary.room.type}</span></p>
                <p className="hh-muted">Occupancy: <span className="font-semibold text-[color:var(--hh-text)]">{studentSummary.room.currentOccupancy}/{studentSummary.room.capacity}</span></p>
                <p className="hh-muted">Available Beds: <span className="font-semibold text-[color:var(--hh-text)]">{studentSummary.room.availableBeds}</span></p>
                <div>
                  <p className="text-xs uppercase tracking-wide hh-muted">Roommates</p>
                  {(studentSummary?.roommates || []).length === 0 ? (
                    <p className="mt-1 text-sm hh-muted">No roommates assigned yet.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {(studentSummary?.roommates || []).map((mate) => (
                        <div key={mate._id} className="rounded-lg border border-[color:var(--hh-border)] p-2">
                          <p className="text-sm font-semibold text-[color:var(--hh-text)]">{mate.name}</p>
                          <p className="text-xs hh-muted">{mate.email}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="hh-surface p-6">
            <h2 className="text-xl font-bold text-[color:var(--hh-text)]">Fee Details</h2>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-[color:var(--hh-border)] p-3">
                <p className="text-xs uppercase tracking-wide hh-muted">Pending Amount</p>
                <p className="mt-1 text-2xl font-bold text-rose-600 dark:text-rose-400">₹{Number(studentSummary?.payments?.pendingAmount || 0).toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-[color:var(--hh-border)] p-3">
                <p className="text-xs uppercase tracking-wide hh-muted">Paid Amount</p>
                <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">₹{Number(studentSummary?.payments?.paidAmount || 0).toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-[color:var(--hh-border)] p-3">
                <p className="text-xs uppercase tracking-wide hh-muted">Pending Invoices</p>
                <p className="mt-1 text-2xl font-bold text-[color:var(--hh-text)]">{studentSummary?.payments?.pendingCount || 0}</p>
              </div>
            </div>
          </div>

          <div className="hh-surface p-6">
            <h2 className="text-xl font-bold text-[color:var(--hh-text)]">Fee Payment History</h2>
            <div className="mt-3 space-y-2">
              {(studentSummary?.recentPayments || []).length === 0 ? (
                <p className="text-sm hh-muted">No fee payments yet.</p>
              ) : (
                (studentSummary?.recentPayments || []).map((payment) => (
                  <div key={payment._id} className="rounded-lg border border-[color:var(--hh-border)] p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-[color:var(--hh-text)]">₹{Number(payment.amount || 0).toLocaleString()}</p>
                      <p className="text-xs hh-muted">{payment.status}</p>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-[color:var(--hh-text)]">
                      Fee Month: {payment.billingPeriod || 'N/A'}
                    </p>
                    {payment.dueDate && (
                      <p className="mt-1 text-xs hh-muted">Due: {new Date(payment.dueDate).toLocaleDateString()}</p>
                    )}
                    <p className="mt-1 text-xs hh-muted">{new Date(payment.paymentDate).toLocaleDateString()}</p>
                    {payment.invoiceNumber && <p className="mt-1 text-xs hh-muted">Invoice: {payment.invoiceNumber}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="hh-surface p-6">
          <h2 className="text-xl font-bold text-[color:var(--hh-text)]">Recent Complaints</h2>
          <div className="mt-3 space-y-2">
            {(studentSummary?.recentComplaints || []).length === 0 ? (
              <p className="text-sm hh-muted">No complaints raised yet.</p>
            ) : (
              (studentSummary?.recentComplaints || []).map((item) => (
                <div key={item._id} className="rounded-lg border border-[color:var(--hh-border)] p-3">
                  <p className="text-sm font-semibold text-[color:var(--hh-text)]">{item.title}</p>
                  <p className="mt-1 text-xs hh-muted">Status: {item.status}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isAdminWithoutHostelSelection && (
        <div className="hh-surface p-6">
          <h2 className="text-2xl font-extrabold text-[color:var(--hh-text)]">Select Hostel To Open Dashboard</h2>
          <p className="mt-2 text-sm hh-muted">
            Select one hostel below. After selecting, dashboard shows only that hostel data.
          </p>
        </div>
      )}

      {!isAdminWithoutHostelSelection && (
        <>
          <div className="hh-surface p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="hh-muted text-sm uppercase tracking-[0.2em]">Dashboard</p>
                <h1 className="mt-1 text-3xl font-extrabold text-[color:var(--hh-text)]">
                  {hostelProfile?.name || 'Selected Hostel'}
                </h1>
                <p className="mt-2 text-sm hh-muted">Simple operational summary for this hostel only.</p>
              </div>

              {userInfo?.role === 'Admin' && (
                <button
                  type="button"
                  onClick={changeHostel}
                  className="rounded-lg bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-700 dark:text-amber-300"
                >
                  Change Hostel
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.title} className="hh-card p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className={`rounded-xl bg-gradient-to-br p-3 ${card.tone}`}>
                      <Icon size={20} />
                    </div>
                  </div>
                  <p className="text-sm hh-muted">{card.title}</p>
                  <h3 className="mt-1 text-2xl font-extrabold text-[color:var(--hh-text)]">
                    {card.prefix || ''}
                    {card.value.toLocaleString()}
                  </h3>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="hh-surface p-6">
              <h2 className="text-xl font-bold text-[color:var(--hh-text)]">Monthly Revenue (Keep)</h2>
              <div className="mt-4 space-y-3">
                {analytics.revenueByMonth.length === 0 ? (
                  <p className="text-sm hh-muted">No revenue data yet.</p>
                ) : (
                  analytics.revenueByMonth.map((item) => (
                    <div key={item.month}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="hh-muted">{item.month}</span>
                        <span className="font-semibold text-[color:var(--hh-text)]">₹{item.totalAmount.toLocaleString()}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-black/10 dark:bg-white/10">
                        <div
                          className="h-2 rounded-full bg-emerald-500"
                          style={{ width: `${Math.max(6, (item.totalAmount / maxRevenue) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="hh-surface p-6">
              <h2 className="text-xl font-bold text-[color:var(--hh-text)]">Complaints Status</h2>
              <p className="mt-2 text-sm hh-muted">Only resolved and unresolved complaint summary.</p>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[color:var(--hh-border)] p-4">
                  <p className="text-xs uppercase tracking-wide hh-muted">Resolved</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.resolvedComplaints}</p>
                </div>
                <div className="rounded-xl border border-[color:var(--hh-border)] p-4">
                  <p className="text-xs uppercase tracking-wide hh-muted">Unresolved</p>
                  <p className="mt-1 text-2xl font-bold text-rose-600 dark:text-rose-400">{stats.unresolvedComplaints}</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {userInfo?.role === 'Admin' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="hh-surface p-6">
            <h2 className="text-xl font-bold text-[color:var(--hh-text)]">
              {editingHostelId ? 'Edit Hostel' : 'Create New Hostel'}
            </h2>
            <p className="mt-2 text-sm hh-muted">Create or update hostel structure (floors, rooms, beds).</p>

            <form className="mt-4 space-y-4" onSubmit={createOrUpdateHostel}>
              <input
                value={hostelName}
                onChange={(e) => setHostelName(e.target.value)}
                className="hh-input"
                placeholder="Hostel name (example: Hostel 1)"
                required
              />

              <select className="hh-input" value={hostelPlan} onChange={(e) => setHostelPlan(e.target.value as 'Basic' | 'Pro' | 'Enterprise')}>
                <option value="Basic">Basic</option>
                <option value="Pro">Pro</option>
                <option value="Enterprise">Enterprise</option>
              </select>

              <div className="space-y-3">
                {hostelFloors.map((floor, floorIdx) => (
                  <div key={floor.floorNumber} className="rounded-xl border border-[color:var(--hh-border)] p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold text-[color:var(--hh-text)]">Floor {floor.floorNumber}</p>
                      {hostelFloors.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeFloor(floorIdx)}
                          className="rounded-md bg-rose-500/15 px-2 py-1 text-xs font-semibold text-rose-700 dark:text-rose-300"
                        >
                          Remove Floor
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      {floor.rooms.map((room, roomIdx) => (
                        <div key={`${floor.floorNumber}-${roomIdx}`} className="grid grid-cols-1 gap-2 md:grid-cols-4">
                          <input
                            value={room.roomLabel}
                            onChange={(e) => updateRoom(floorIdx, roomIdx, { roomLabel: e.target.value })}
                            className="hh-input md:col-span-2"
                            placeholder="Room label"
                          />
                          <input
                            type="number"
                            min={1}
                            value={room.beds}
                            onChange={(e) => updateRoom(floorIdx, roomIdx, { beds: Number(e.target.value) || 1 })}
                            className="hh-input"
                            placeholder="Beds"
                          />
                          <button
                            type="button"
                            onClick={() => removeRoom(floorIdx, roomIdx)}
                            className="rounded-lg bg-amber-500/15 px-2 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300"
                          >
                            Remove Room
                          </button>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => addRoom(floorIdx)}
                      className="mt-3 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
                    >
                      + Add Room
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addFloor}
                className="rounded-lg bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-700 dark:text-cyan-300"
              >
                + Add Floor
              </button>

              <div>
                <label className="mb-1 block text-sm font-semibold text-[color:var(--hh-text)]">Reference Pictures</label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => setReferenceFiles(Array.from(e.target.files || []).slice(0, 5))}
                  className="hh-input"
                />
              </div>

              <button type="submit" disabled={isCreatingHostel} className="hh-btn-primary w-full py-3 text-base disabled:opacity-70">
                {isCreatingHostel ? 'Saving...' : editingHostelId ? 'Update Hostel' : 'Create Hostel'}
              </button>

              {editingHostelId && (
                <button
                  type="button"
                  onClick={cancelEditHostel}
                  className="w-full rounded-lg bg-[color:var(--hh-muted-bg)] py-3 text-sm font-semibold text-[color:var(--hh-text)]"
                >
                  Cancel Edit
                </button>
              )}

              {hostelCreateMessage && <p className="text-xs hh-muted">{hostelCreateMessage}</p>}
            </form>
          </div>

          <div className="hh-surface p-6">
            <h2 className="text-xl font-bold text-[color:var(--hh-text)]">My Hostels</h2>
            <p className="mt-2 text-sm hh-muted">Open one hostel to view its dashboard data only.</p>

            <div className="mt-4 space-y-3">
              {ownedHostels.length === 0 ? (
                <p className="text-sm hh-muted">No hostels created yet.</p>
              ) : (
                ownedHostels.map((hostel) => (
                  <div key={hostel._id} className="rounded-xl border border-[color:var(--hh-border)] p-4">
                    <p className="text-sm font-semibold text-[color:var(--hh-text)]">{hostel.name}</p>
                    <p className="mt-1 text-xs hh-muted">
                      Plan: {hostel.subscriptionPlan} | Floors: {hostel.floorsCount} | Rooms: {hostel.totalRooms} | Beds: {hostel.totalBeds}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openHostelDashboard(hostel._id)}
                        className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
                      >
                        Open Dashboard
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditHostel(hostel._id)}
                        className="rounded-lg bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-700 dark:text-cyan-300"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => moveToRecycleBin(hostel._id)}
                        className="rounded-lg bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-6">
              <h3 className="text-lg font-bold text-[color:var(--hh-text)]">Recycle Bin</h3>
              <p className="mt-1 text-sm hh-muted">Restore or permanently delete hostels here.</p>

              <div className="mt-3 space-y-3">
                {deletedHostels.length === 0 ? (
                  <p className="text-sm hh-muted">Recycle bin is empty.</p>
                ) : (
                  deletedHostels.map((hostel) => (
                    <div key={hostel._id} className="rounded-xl border border-[color:var(--hh-border)] p-4">
                      <p className="text-sm font-semibold text-[color:var(--hh-text)]">{hostel.name}</p>
                      <p className="mt-1 text-xs hh-muted">
                        Plan: {hostel.subscriptionPlan} | Rooms: {hostel.totalRooms} | Beds: {hostel.totalBeds}
                      </p>
                      {hostel.deletedAt && (
                        <p className="mt-1 text-xs hh-muted">Deleted on: {new Date(hostel.deletedAt).toLocaleString()}</p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => restoreFromRecycleBin(hostel._id)}
                          className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          onClick={() => permanentlyDeleteHostel(hostel._id)}
                          className="rounded-lg bg-rose-500/20 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300"
                        >
                          Delete Permanently
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
