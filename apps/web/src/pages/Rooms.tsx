import React, { useEffect, useState } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Home, Plus, Search, X } from 'lucide-react';

type ApiError = {
  response?: {
    data?: {
      message?: string;
    };
  };
};

interface Room {
  _id: string;
  roomNumber: string;
  capacity: number;
  currentOccupancy: number;
  type: string;
  monthlyRent: number;
}

interface RoomStudent {
  _id: string;
  name: string;
  email: string;
  bookingId: string;
  startDate: string;
}

interface RoomDetailsResponse {
  room: Room & { emptyBeds: number };
  students: RoomStudent[];
}

interface UnallocatedStudent {
  _id: string;
  name: string;
  email: string;
  registrationId?: string;
}

const Rooms: React.FC = () => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ roomNumber: '', capacity: 2, type: 'Non-AC', monthlyRent: 5000 });
  const [selectedRoomDetails, setSelectedRoomDetails] = useState<RoomDetailsResponse | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [autoSyncAttempted, setAutoSyncAttempted] = useState(false);
  const [unallocatedStudents, setUnallocatedStudents] = useState<UnallocatedStudent[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [isAllocating, setIsAllocating] = useState(false);

  const fetchRooms = async () => {
    try {
      const { data } = await api.get('/rooms', {
        params: { page, limit: 18, search: search || undefined },
      });
      const fetchedRooms = data?.data || [];
      setRooms(fetchedRooms);
      setTotalPages(data?.pagination?.totalPages || 1);

      if (!search && page === 1 && fetchedRooms.length === 0 && !autoSyncAttempted) {
        setAutoSyncAttempted(true);
        await api.post('/rooms/sync-from-hostel');

        const retry = await api.get('/rooms', {
          params: { page: 1, limit: 18 },
        });
        setRooms(retry?.data?.data || []);
        setTotalPages(retry?.data?.pagination?.totalPages || 1);
      }
    } catch {
      // Handled silently for empty start
    }
  };

  useEffect(() => {
    fetchRooms();
  }, [page, search]);

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/rooms', formData);
      toast.success('Room added successfully');
      setIsModalOpen(false);
      setFormData({ roomNumber: '', capacity: 2, type: 'Non-AC', monthlyRent: 5000 });
      fetchRooms();
    } catch (error: unknown) {
      const apiError = error as ApiError;
      toast.error(apiError.response?.data?.message || 'Failed to add room');
    }
  };

  const openRoomDetails = async (roomId: string) => {
    try {
      const [roomRes, studentRes] = await Promise.all([
        api.get(`/rooms/${roomId}`),
        api.get('/bookings/unallocated-students'),
      ]);

      setSelectedRoomDetails(roomRes.data);
      setUnallocatedStudents(studentRes.data?.data || []);
      setSelectedStudentId('');
      setIsDetailsOpen(true);
    } catch (error: unknown) {
      const apiError = error as ApiError;
      toast.error(apiError.response?.data?.message || 'Failed to load room details');
    }
  };

  const handleAllocateStudent = async () => {
    if (!selectedRoomDetails || !selectedStudentId) {
      toast.error('Select a student first');
      return;
    }

    setIsAllocating(true);
    try {
      const payload = {
        user: selectedStudentId,
        room: selectedRoomDetails.room._id,
        startDate: new Date().toISOString(),
      };

      const { data } = await api.post('/bookings', payload);
      const feeStarted = Boolean(data?.paymentInitialized);

      toast.success(feeStarted ? 'Student allocated and fee allocation started' : 'Student allocated successfully');

      await openRoomDetails(selectedRoomDetails.room._id);
      await fetchRooms();
    } catch (error: unknown) {
      const apiError = error as ApiError;
      toast.error(apiError.response?.data?.message || 'Failed to allocate student');
    } finally {
      setIsAllocating(false);
    }
  };

  const getFloorKey = (roomNumber: string) => {
    const normalized = String(roomNumber || '').trim();
    const fMatch = normalized.match(/F\s*(\d+)/i);
    if (fMatch) return `Floor ${fMatch[1]}`;

    const nMatch = normalized.match(/^(\d{3,4})/);
    if (nMatch) {
      const value = Number(nMatch[1]);
      const floor = Math.floor(value / 100);
      if (floor > 0) return `Floor ${floor}`;
    }

    return 'Other Rooms';
  };

  const groupedRooms = rooms.reduce<Record<string, Room[]>>((acc, room) => {
    const key = getFloorKey(room.roomNumber);
    if (!acc[key]) acc[key] = [];
    acc[key].push(room);
    return acc;
  }, {});

  const sortedFloorKeys = Object.keys(groupedRooms).sort((a, b) => {
    const aNum = Number((a.match(/(\d+)/) || [])[1] || Number.MAX_SAFE_INTEGER);
    const bNum = Number((b.match(/(\d+)/) || [])[1] || Number.MAX_SAFE_INTEGER);
    return aNum - bNum;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-col md:flex-row gap-4">
        <h1 className="text-3xl font-extrabold text-[color:var(--hh-text)]">Room Management</h1>
        <div className="flex space-x-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 hh-muted w-5 h-5" />
            <input 
              type="text" 
              placeholder="Search rooms..." 
              value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              className="hh-input pl-10"
            />
          </div>
          <button onClick={() => setIsModalOpen(true)} className="hh-btn-accent">
            <Plus className="w-5 h-5 mr-2" /> Add Room
          </button>
        </div>
      </div>

      {rooms.length === 0 ? (
        <div className="hh-surface p-6">
          <p className="text-sm hh-muted">
            No room cards found for this hostel yet. Create rooms or update hostel floor/room layout first.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedFloorKeys.map((floorKey) => (
            <div key={floorKey} className="space-y-3">
              <h2 className="text-lg font-bold text-[color:var(--hh-text)]">{floorKey}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {groupedRooms[floorKey]
                  .slice()
                  .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber))
                  .map((room) => (
                    <button
                      type="button"
                      key={room._id}
                      onClick={() => openRoomDetails(room._id)}
                      className="hh-card p-6 text-left transition-shadow hover:shadow-md"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center">
                          <div className="mr-3 rounded-lg bg-cyan-500/15 p-3 text-cyan-700 dark:text-cyan-300">
                            <Home size={24} />
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-[color:var(--hh-text)]">Room {room.roomNumber}</h3>
                            <span className="mt-1 inline-block rounded-full bg-black/5 px-2 py-1 text-sm hh-muted dark:bg-white/10">
                              {room.type}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 mt-4">
                        <div className="flex justify-between text-sm">
                          <span className="hh-muted">Occupancy</span>
                          <span className="font-medium text-[color:var(--hh-text)]">{room.currentOccupancy} / {room.capacity}</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-black/10 dark:bg-white/10">
                          <div
                            className={`h-2 rounded-full ${room.currentOccupancy === room.capacity ? 'bg-red-500' : 'bg-teal-500'}`}
                            style={{ width: `${(room.currentOccupancy / room.capacity) * 100}%` }}
                          ></div>
                        </div>
                        <div className="flex justify-between text-sm pt-2">
                          <span className="hh-muted">Rent</span>
                          <span className="font-medium text-emerald-600 dark:text-emerald-400">₹{room.monthlyRent}/mo</span>
                        </div>
                        <p className="pt-2 text-xs hh-muted">Click to view student names and room details</p>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          ))}
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
              <h2 className="text-xl font-bold text-[color:var(--hh-text)]">Add New Room</h2>
              <button onClick={() => setIsModalOpen(false)} className="hh-muted hover:text-[color:var(--hh-text)]"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddRoom} className="space-y-4">
              <input type="text" placeholder="Room Number (e.g., 101A)" required value={formData.roomNumber} onChange={(e) => setFormData({...formData, roomNumber: e.target.value})} className="hh-input" />
              <input type="number" placeholder="Capacity" required value={formData.capacity} onChange={(e) => setFormData({...formData, capacity: parseInt(e.target.value)})} className="hh-input" />
              <select value={formData.type} onChange={(e) => setFormData({...formData, type: e.target.value})} className="hh-input">
                <option value="Non-AC">Non-AC</option>
                <option value="AC">AC</option>
              </select>
              <input type="number" placeholder="Monthly Rent" required value={formData.monthlyRent} onChange={(e) => setFormData({...formData, monthlyRent: parseInt(e.target.value)})} className="hh-input" />
              <button type="submit" className="hh-btn-accent w-full">Save Room</button>
            </form>
          </div>
        </div>
      )}

      {isDetailsOpen && selectedRoomDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="hh-surface w-full max-w-2xl p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-[color:var(--hh-text)]">
                Room {selectedRoomDetails.room.roomNumber} Details
              </h2>
              <button
                onClick={() => {
                  setIsDetailsOpen(false);
                  setSelectedRoomDetails(null);
                }}
                className="hh-muted hover:text-[color:var(--hh-text)]"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-[color:var(--hh-border)] p-3">
                <p className="text-xs hh-muted">Capacity</p>
                <p className="text-lg font-bold text-[color:var(--hh-text)]">{selectedRoomDetails.room.capacity}</p>
              </div>
              <div className="rounded-lg border border-[color:var(--hh-border)] p-3">
                <p className="text-xs hh-muted">Occupied</p>
                <p className="text-lg font-bold text-[color:var(--hh-text)]">{selectedRoomDetails.room.currentOccupancy}</p>
              </div>
              <div className="rounded-lg border border-[color:var(--hh-border)] p-3">
                <p className="text-xs hh-muted">Empty Beds</p>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{selectedRoomDetails.room.emptyBeds}</p>
              </div>
              <div className="rounded-lg border border-[color:var(--hh-border)] p-3">
                <p className="text-xs hh-muted">Type</p>
                <p className="text-lg font-bold text-[color:var(--hh-text)]">{selectedRoomDetails.room.type}</p>
              </div>
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-semibold text-[color:var(--hh-text)]">Students in this room</h3>
              <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">
                {selectedRoomDetails.students.length === 0 ? (
                  <p className="text-sm hh-muted">No active students assigned to this room.</p>
                ) : (
                  selectedRoomDetails.students.map((student) => (
                    <div key={student.bookingId} className="rounded-lg border border-[color:var(--hh-border)] p-3">
                      <p className="text-sm font-semibold text-[color:var(--hh-text)]">{student.name}</p>
                      <p className="text-xs hh-muted">{student.email}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-[color:var(--hh-border)] p-4">
              <h3 className="text-sm font-semibold text-[color:var(--hh-text)]">Allocate student to this room</h3>
              {selectedRoomDetails.room.emptyBeds <= 0 ? (
                <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">Room is full. No empty beds available.</p>
              ) : (
                <>
                  <p className="mt-1 text-xs hh-muted">
                    Only registered students without active room allocation are shown here.
                  </p>
                  <div className="mt-3 flex flex-col gap-2 md:flex-row">
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="hh-input"
                    >
                      <option value="">Select unallocated student</option>
                      {unallocatedStudents.map((student) => (
                        <option key={student._id} value={student._id}>
                          {student.name} ({student.registrationId || student.email})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAllocateStudent}
                      disabled={!selectedStudentId || isAllocating}
                      className="hh-btn-primary disabled:opacity-60"
                    >
                      {isAllocating ? 'Allocating...' : 'Allocate Student'}
                    </button>
                  </div>
                  {unallocatedStudents.length === 0 && (
                    <p className="mt-2 text-sm hh-muted">No unallocated students available.</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Rooms;
