import React, { useState, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const Layout: React.FC = () => {
  const { userInfo } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Theme state
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark';
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  if (!userInfo?.token) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="relative flex min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/3 h-96 w-96 rounded-full bg-teal-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 top-1/4 h-72 w-72 rounded-full bg-amber-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 left-1/4 h-80 w-80 rounded-full bg-cyan-500/15 blur-3xl" />

      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        <Topbar 
          onMenuClick={() => setSidebarOpen(true)} 
          darkMode={darkMode} 
          toggleDarkMode={() => setDarkMode(!darkMode)} 
        />
        
        <main className="flex-1 overflow-y-auto p-2 sm:p-3 md:p-6">
          <div className="hh-glass hh-fade-in mx-auto w-full max-w-7xl rounded-2xl border border-white/20 p-2.5 sm:p-3 md:rounded-[28px] md:p-5 dark:border-white/10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
