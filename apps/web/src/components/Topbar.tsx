import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Menu, Moon, Sun, LogOut, User, Bell } from 'lucide-react';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from '../services/notifications';

interface TopbarProps {
  onMenuClick: () => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
}

const Topbar: React.FC<TopbarProps> = ({ onMenuClick, darkMode, toggleDarkMode }) => {
  const { userInfo, logout } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);

  const loadNotifications = async () => {
    if (!userInfo?.token) return;

    setLoadingNotifications(true);
    try {
      const response = await fetchNotifications({ page: 1, limit: 8 });
      setNotifications(response.data);
    } finally {
      setLoadingNotifications(false);
    }
  };

  useEffect(() => {
    loadNotifications();

    const interval = setInterval(() => {
      loadNotifications();
    }, 20000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userInfo?.token]);

  const unreadCount = useMemo(() => {
    return notifications.filter((item) => !item.isRead).length;
  }, [notifications]);

  const handleMarkRead = async (id: string) => {
    await markNotificationRead(id);
    setNotifications((prev) => prev.map((item) => (item._id === id ? { ...item, isRead: true } : item)));
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
  };

  const todayLabel = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });

  return (
    <header className="z-10 flex h-20 items-center justify-between px-4 lg:px-6">
      <div className="flex items-center gap-2">
        <button 
          onClick={onMenuClick}
          className="hh-glass rounded-xl p-2 text-stone-700 shadow-sm hover:bg-white/80 lg:hidden dark:text-stone-200"
        >
          <Menu size={24} />
        </button>

        <div>
          <p className="text-xs uppercase tracking-[0.2em] hh-muted">Daily control panel</p>
          <h1 className="text-lg font-bold text-[color:var(--hh-text)]">
            Hostel <span className="hh-gradient-title">Operations</span>
          </h1>
        </div>

        <span className="hh-chip ml-2 hidden md:inline-flex">{todayLabel}</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            onClick={() => setNotificationPanelOpen((open) => !open)}
            className="hh-glass relative rounded-full p-2 text-stone-700 shadow-sm transition-colors hover:bg-white/80 dark:text-stone-200"
            aria-label="Toggle notifications"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {notificationPanelOpen && (
            <div className="absolute right-0 top-12 z-40 w-80 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl dark:border-white/10 dark:bg-stone-950">
              <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
                <p className="text-sm font-semibold text-[color:var(--hh-text)]">Notifications</p>
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs font-medium text-teal-700 hover:text-teal-900 dark:text-teal-300 dark:hover:text-teal-100"
                >
                  Mark all read
                </button>
              </div>

              <div className="max-h-80 overflow-y-auto">
                {loadingNotifications ? (
                  <p className="px-4 py-3 text-sm hh-muted">Loading...</p>
                ) : notifications.length === 0 ? (
                  <p className="px-4 py-3 text-sm hh-muted">No notifications yet</p>
                ) : (
                  notifications.map((item) => (
                    <button
                      key={item._id}
                      onClick={() => handleMarkRead(item._id)}
                      className={`w-full border-b border-black/5 px-4 py-3 text-left last:border-b-0 dark:border-white/5 ${
                        item.isRead ? 'opacity-70' : ''
                      }`}
                    >
                      <p className="text-sm font-semibold text-[color:var(--hh-text)]">{item.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs hh-muted">{item.message}</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <button 
          onClick={toggleDarkMode}
          className="hh-glass rounded-full p-2 text-stone-700 shadow-sm transition-colors hover:bg-white/80 dark:text-stone-200"
          aria-label="Toggle dark mode"
        >
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        <div className="flex items-center border-l border-black/10 pl-3 dark:border-white/10">
          <div className="mr-3 flex items-center space-x-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
              <User size={16} />
            </div>
            <div className="hidden md:block text-sm">
              <p className="font-semibold text-[color:var(--hh-text)]">{userInfo?.name || 'Guest'}</p>
              <p className="hh-muted text-xs">{userInfo?.role || 'User'}</p>
            </div>
          </div>
          
          <button 
            onClick={logout}
            className="rounded-full p-2 text-red-500 transition-colors hover:bg-red-100/70 hover:text-red-700 dark:hover:bg-red-900/30"
            title="Logout"
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Topbar;
