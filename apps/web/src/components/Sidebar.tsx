import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, Users, Home, BookOpen, CreditCard, MessageSquare, Sparkles, X } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, setIsOpen }) => {
  const { userInfo, activeHostelId } = useAuth();
  
  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Students', path: '/students', icon: Users, roles: ['Admin', 'Staff'] },
    { name: 'Rooms', path: '/rooms', icon: Home, roles: ['Admin'] },
    { name: 'Bookings', path: '/bookings', icon: BookOpen, roles: ['Admin', 'Staff'] },
    { name: 'Payments', path: '/payments', icon: CreditCard },
    { name: 'Complaints', path: '/complaints', icon: MessageSquare },
  ];

  const filteredItems = navItems.filter(
    item => !item.roles || (userInfo && item.roles.includes(userInfo.role))
  );

  const visibleItems =
    userInfo?.role === 'Admin' && !activeHostelId
      ? filteredItems.filter((item) => item.path === '/')
      : filteredItems;

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-20 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside 
        className={`fixed inset-y-0 left-0 z-30 w-72 border-r border-white/20 bg-stone-900/95 text-stone-100 shadow-2xl backdrop-blur-xl transform transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-300/40 to-amber-300/40 text-white">
              <Sparkles size={18} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-teal-300/80">Operations</p>
              <span className="text-2xl font-extrabold text-white">HostelHub</span>
            </div>
          </div>
          <button onClick={() => setIsOpen(false)} className="rounded-lg p-1 text-stone-300 hover:bg-white/10 hover:text-white lg:hidden">
            <X size={24} />
          </button>
        </div>

        <div className="px-4 pt-4">
          <span className="hh-chip border-white/15 bg-white/5 text-stone-200">
            <Sparkles size={12} />
            Smart Command Center
          </span>
        </div>

        <nav className="space-y-2 p-4">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const itemLabel =
              userInfo?.role === 'Student' && item.path === '/payments'
                ? 'Fee Details & Payment'
                : item.name;
            return (
              <NavLink
                key={item.name}
                to={item.path}
                className={({ isActive }) =>
                  `group relative flex items-center rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                    isActive 
                      ? 'bg-gradient-to-r from-teal-500/25 to-emerald-400/20 text-white shadow-lg shadow-teal-900/30 before:absolute before:bottom-2 before:left-1 before:top-2 before:w-1 before:rounded-full before:bg-teal-300' 
                      : 'text-stone-300 hover:bg-white/10 hover:text-white'
                  }`
                }
                onClick={() => setIsOpen(false)}
              >
                <Icon className="mr-3 h-5 w-5" />
                <span className="font-medium">{itemLabel}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-white/10 p-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs uppercase tracking-wide text-stone-400">Logged in as</p>
            <p className="mt-1 text-sm font-semibold text-white">{userInfo?.name || 'Guest User'}</p>
            <p className="text-xs text-stone-400">{userInfo?.role || 'No role'}</p>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
