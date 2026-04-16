import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Students from './pages/Students';
import Rooms from './pages/Rooms';
import Bookings from './pages/Bookings';
import Payments from './pages/Payments';
import Complaints from './pages/Complaints';
import { Toaster } from 'react-hot-toast';

type AllowedRole = 'Admin' | 'Staff' | 'Student';

const PrivateRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { userInfo } = useAuth();
  if (!userInfo?.token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

const RoleRoute: React.FC<{ children: React.ReactElement; roles: AllowedRole[] }> = ({ children, roles }) => {
  const { userInfo, activeHostelId } = useAuth();
  if (!userInfo?.token) {
    return <Navigate to="/login" replace />;
  }
  if (userInfo.role === 'Admin' && !activeHostelId) {
    return <Navigate to="/" replace />;
  }
  if (!roles.includes(userInfo.role)) {
    return <Navigate to="/" replace />;
  }
  return children;
};

const TenantRequiredRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { userInfo, activeHostelId } = useAuth();
  if (!userInfo?.token) {
    return <Navigate to="/login" replace />;
  }
  if (userInfo.role === 'Admin' && !activeHostelId) {
    return <Navigate to="/" replace />;
  }
  return children;
};

const GuestRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { userInfo } = useAuth();
  if (userInfo?.token) {
    return <Navigate to="/" replace />;
  }
  return children;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              borderRadius: '12px',
              border: '1px solid rgba(0,0,0,0.08)',
            },
          }}
        />
        <Routes>
          <Route
            path="/login"
            element={
              <GuestRoute>
                <Login />
              </GuestRoute>
            }
          />
          
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route
              path="students"
              element={
                <RoleRoute roles={['Admin', 'Staff']}>
                  <Students />
                </RoleRoute>
              }
            />
            <Route
              path="rooms"
              element={
                <RoleRoute roles={['Admin']}>
                  <Rooms />
                </RoleRoute>
              }
            />
            <Route
              path="bookings"
              element={
                <RoleRoute roles={['Admin', 'Staff']}>
                  <Bookings />
                </RoleRoute>
              }
            />
            <Route
              path="payments"
              element={
                <TenantRequiredRoute>
                  <Payments />
                </TenantRequiredRoute>
              }
            />
            <Route
              path="complaints"
              element={
                <TenantRequiredRoute>
                  <Complaints />
                </TenantRequiredRoute>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
