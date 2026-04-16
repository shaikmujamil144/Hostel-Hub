import React, { createContext, useContext, useState } from 'react';

export interface UserInfo {
  _id: string;
  hostelId: string;
  name: string;
  email: string;
  role: 'Admin' | 'Staff' | 'Student';
  token: string;
}

interface AuthContextType {
  userInfo: UserInfo | null;
  activeHostelId: string | null;
  setActiveHostelId: (hostelId: string | null) => void;
  login: (data: UserInfo) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(() => {
    const saved = localStorage.getItem('userInfo');
    return saved ? JSON.parse(saved) : null;
  });
  const [activeHostelId, setActiveHostelIdState] = useState<string | null>(() => {
    return localStorage.getItem('activeHostelId');
  });

  const setActiveHostelId = (hostelId: string | null) => {
    setActiveHostelIdState(hostelId);
    if (hostelId) {
      localStorage.setItem('activeHostelId', hostelId);
    } else {
      localStorage.removeItem('activeHostelId');
    }
  };

  const login = (data: UserInfo) => {
    setUserInfo(data);
    localStorage.setItem('userInfo', JSON.stringify(data));
    if (data.role === 'Admin') {
      setActiveHostelId(null);
    } else {
      setActiveHostelId(data.hostelId);
    }
  };

  const logout = () => {
    setUserInfo(null);
    localStorage.removeItem('userInfo');
    setActiveHostelId(null);
  };

  return (
    <AuthContext.Provider value={{ userInfo, activeHostelId, setActiveHostelId, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
