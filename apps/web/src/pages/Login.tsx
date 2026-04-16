import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Building2, IdCard, Lock, Mail, Phone, ShieldCheck, UserPlus, UserRound } from 'lucide-react';

type ApiError = {
  response?: {
    data?: {
      message?: string;
      otp?: string;
    };
  };
};

type HostelOption = {
  _id: string;
  name: string;
};

type Mode = 'student-login' | 'admin-login' | 'student-register' | 'forgot-password';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [mode, setMode] = useState<Mode>('student-login');
  const [hostels, setHostels] = useState<HostelOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [studentLogin, setStudentLogin] = useState({ hostelId: '', identifier: '', password: '' });
  const [adminLogin, setAdminLogin] = useState({ adminId: '123', password: 'admin123' });

  const [registerStudent, setRegisterStudent] = useState({
    hostelId: '',
    registrationId: '',
    name: '',
    phone: '',
    email: '',
    password: '',
  });

  const [forgotPassword, setForgotPassword] = useState({
    loginAs: 'Student' as 'Student' | 'Admin',
    hostelId: '',
    contact: '',
    otp: '',
    newPassword: '',
  });
  const [otpRequested, setOtpRequested] = useState(false);
  const [devOtp, setDevOtp] = useState<string>('');

  useEffect(() => {
    const loadHostels = async () => {
      try {
        const { data } = await api.get('/auth/hostels');
        setHostels(data || []);
      } catch {
        setHostels([]);
      }
    };

    loadHostels();
  }, []);

  const selectedHostelName = useMemo(() => {
    if (!studentLogin.hostelId) return '';
    return hostels.find((item) => item._id === studentLogin.hostelId)?.name || '';
  }, [studentLogin.hostelId, hostels]);

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { data } = await api.post('/auth/login', {
        loginAs: 'Student',
        hostelId: studentLogin.hostelId,
        identifier: studentLogin.identifier,
        password: studentLogin.password,
      });
      login(data);
      toast.success(`Welcome ${data.name}`);
      navigate('/');
    } catch (error: unknown) {
      const apiError = error as ApiError;
      toast.error(apiError.response?.data?.message || 'Student login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { data } = await api.post('/auth/login', {
        loginAs: 'Admin',
        adminId: adminLogin.adminId,
        password: adminLogin.password,
      });
      login(data);
      toast.success(`Welcome ${data.name}`);
      navigate('/');
    } catch (error: unknown) {
      const apiError = error as ApiError;
      toast.error(apiError.response?.data?.message || 'Admin login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStudentRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await api.post('/auth/register-student', registerStudent);
      toast.success('Student registered. You can log in now.');
      setStudentLogin((prev) => ({
        ...prev,
        hostelId: registerStudent.hostelId,
        identifier: registerStudent.registrationId,
        password: '',
      }));
      setMode('student-login');
    } catch (error: unknown) {
      const apiError = error as ApiError;
      toast.error(apiError.response?.data?.message || 'Student registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const payload: Record<string, string> = {
        loginAs: forgotPassword.loginAs,
        contact: forgotPassword.contact,
      };
      if (forgotPassword.loginAs === 'Student') {
        payload.hostelId = forgotPassword.hostelId;
      }

      const { data } = await api.post('/auth/forgot-password/request-otp', payload);
      setOtpRequested(true);
      setDevOtp(data?.otp || '');
      toast.success('OTP sent successfully');
    } catch (error: unknown) {
      const apiError = error as ApiError;
      toast.error(apiError.response?.data?.message || 'Failed to send OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const payload: Record<string, string> = {
        loginAs: forgotPassword.loginAs,
        contact: forgotPassword.contact,
        otp: forgotPassword.otp,
        newPassword: forgotPassword.newPassword,
      };
      if (forgotPassword.loginAs === 'Student') {
        payload.hostelId = forgotPassword.hostelId;
      }

      await api.post('/auth/forgot-password/reset', payload);
      toast.success('Password updated. Please login.');
      setOtpRequested(false);
      setDevOtp('');
      setForgotPassword((prev) => ({ ...prev, otp: '', newPassword: '' }));
      setMode(forgotPassword.loginAs === 'Admin' ? 'admin-login' : 'student-login');
    } catch (error: unknown) {
      const apiError = error as ApiError;
      toast.error(apiError.response?.data?.message || 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute -left-20 top-14 h-72 w-72 rounded-full bg-teal-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-12 h-72 w-72 rounded-full bg-amber-500/20 blur-3xl" />

      <div className="relative grid w-full max-w-6xl gap-6 lg:grid-cols-2">
        <div className="hidden rounded-3xl bg-stone-900 p-8 text-stone-100 shadow-2xl lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-teal-300">HostelHub Access</p>
            <h1 className="mt-3 text-4xl font-extrabold leading-tight">Student + Admin Auth, all in one flow.</h1>
            <p className="mt-4 text-sm text-stone-300">
              Students can register with hostel details and registered ID. Admin can log in directly with admin ID and password.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-stone-200">
            {selectedHostelName ? `Selected hostel: ${selectedHostelName}` : 'Use tabs on right to switch auth mode.'}
          </div>
        </div>

        <div className="hh-surface w-full p-6 md:p-8">
          <div className="mb-5 flex flex-wrap gap-2">
            <button type="button" onClick={() => setMode('student-login')} className={`hh-chip ${mode === 'student-login' ? 'bg-teal-500/20 text-teal-700 dark:text-teal-300' : ''}`}>
              <UserRound size={14} /> Student Login
            </button>
            <button type="button" onClick={() => setMode('student-register')} className={`hh-chip ${mode === 'student-register' ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300' : ''}`}>
              <UserPlus size={14} /> Student Register
            </button>
            <button type="button" onClick={() => setMode('admin-login')} className={`hh-chip ${mode === 'admin-login' ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300' : ''}`}>
              <ShieldCheck size={14} /> Admin Login
            </button>
            <button type="button" onClick={() => setMode('forgot-password')} className={`hh-chip ${mode === 'forgot-password' ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300' : ''}`}>
              <Lock size={14} /> Forgot Password
            </button>
          </div>

          {mode === 'student-login' && (
            <form onSubmit={handleStudentLogin} className="space-y-4">
              <h2 className="text-2xl font-extrabold text-[color:var(--hh-text)]">Student Login</h2>
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 hh-muted" />
                <select
                  value={studentLogin.hostelId}
                  onChange={(e) => setStudentLogin((prev) => ({ ...prev, hostelId: e.target.value }))}
                  required
                  className="hh-input pl-10"
                >
                  <option value="">Select Hostel</option>
                  {hostels.map((hostel) => (
                    <option key={hostel._id} value={hostel._id}>
                      {hostel.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="relative">
                <IdCard className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 hh-muted" />
                <input
                  value={studentLogin.identifier}
                  onChange={(e) => setStudentLogin((prev) => ({ ...prev, identifier: e.target.value }))}
                  required
                  className="hh-input pl-10"
                  placeholder="Registered ID / Email / Phone"
                />
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 hh-muted" />
                <input
                  type="password"
                  value={studentLogin.password}
                  onChange={(e) => setStudentLogin((prev) => ({ ...prev, password: e.target.value }))}
                  required
                  className="hh-input pl-10"
                  placeholder="Password"
                />
              </div>
              <button type="submit" disabled={isLoading} className="hh-btn-primary w-full py-3 text-base disabled:opacity-70">
                {isLoading ? 'Please wait...' : 'Login as Student'}
              </button>
            </form>
          )}

          {mode === 'admin-login' && (
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <h2 className="text-2xl font-extrabold text-[color:var(--hh-text)]">Admin Login</h2>
              <p className="text-xs hh-muted">
                Default demo credentials: Admin ID <strong>123</strong>, Password <strong>admin123</strong>
              </p>
              <div className="relative">
                <IdCard className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 hh-muted" />
                <input
                  value={adminLogin.adminId}
                  onChange={(e) => setAdminLogin((prev) => ({ ...prev, adminId: e.target.value }))}
                  required
                  className="hh-input pl-10"
                  placeholder="Admin ID / Email / Phone"
                />
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 hh-muted" />
                <input
                  type="password"
                  value={adminLogin.password}
                  onChange={(e) => setAdminLogin((prev) => ({ ...prev, password: e.target.value }))}
                  required
                  className="hh-input pl-10"
                  placeholder="Password"
                />
              </div>
              <button type="submit" disabled={isLoading} className="hh-btn-primary w-full py-3 text-base disabled:opacity-70">
                {isLoading ? 'Please wait...' : 'Login as Admin'}
              </button>
            </form>
          )}

          {mode === 'student-register' && (
            <form onSubmit={handleStudentRegister} className="space-y-4">
              <h2 className="text-2xl font-extrabold text-[color:var(--hh-text)]">Student Registration</h2>
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 hh-muted" />
                <select
                  value={registerStudent.hostelId}
                  onChange={(e) => setRegisterStudent((prev) => ({ ...prev, hostelId: e.target.value }))}
                  required
                  className="hh-input pl-10"
                >
                  <option value="">Select Hostel</option>
                  {hostels.map((hostel) => (
                    <option key={hostel._id} value={hostel._id}>
                      {hostel.name}
                    </option>
                  ))}
                </select>
              </div>
              <input value={registerStudent.registrationId} onChange={(e) => setRegisterStudent((prev) => ({ ...prev, registrationId: e.target.value }))} required className="hh-input" placeholder="Registered ID" />
              <input value={registerStudent.name} onChange={(e) => setRegisterStudent((prev) => ({ ...prev, name: e.target.value }))} required className="hh-input" placeholder="Full Name" />
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 hh-muted" />
                <input value={registerStudent.phone} onChange={(e) => setRegisterStudent((prev) => ({ ...prev, phone: e.target.value }))} required className="hh-input pl-10" placeholder="Phone Number" />
              </div>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 hh-muted" />
                <input type="email" value={registerStudent.email} onChange={(e) => setRegisterStudent((prev) => ({ ...prev, email: e.target.value }))} required className="hh-input pl-10" placeholder="Email Address" />
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 hh-muted" />
                <input type="password" value={registerStudent.password} onChange={(e) => setRegisterStudent((prev) => ({ ...prev, password: e.target.value }))} required className="hh-input pl-10" placeholder="Create Password" />
              </div>
              <button type="submit" disabled={isLoading} className="hh-btn-accent w-full py-3 text-base disabled:opacity-70">
                {isLoading ? 'Please wait...' : 'Register Student'}
              </button>
            </form>
          )}

          {mode === 'forgot-password' && (
            <div className="space-y-4">
              <h2 className="text-2xl font-extrabold text-[color:var(--hh-text)]">Forgot Password (OTP)</h2>

              <form onSubmit={otpRequested ? handleResetPassword : handleRequestOtp} className="space-y-4">
                <select
                  value={forgotPassword.loginAs}
                  onChange={(e) => {
                    const loginAs = e.target.value as 'Student' | 'Admin';
                    setForgotPassword((prev) => ({ ...prev, loginAs }));
                    setOtpRequested(false);
                    setDevOtp('');
                  }}
                  className="hh-input"
                >
                  <option value="Student">Student</option>
                  <option value="Admin">Admin</option>
                </select>

                {forgotPassword.loginAs === 'Student' && (
                  <select
                    value={forgotPassword.hostelId}
                    onChange={(e) => setForgotPassword((prev) => ({ ...prev, hostelId: e.target.value }))}
                    required
                    className="hh-input"
                  >
                    <option value="">Select Hostel</option>
                    {hostels.map((hostel) => (
                      <option key={hostel._id} value={hostel._id}>
                        {hostel.name}
                      </option>
                    ))}
                  </select>
                )}

                <input
                  value={forgotPassword.contact}
                  onChange={(e) => setForgotPassword((prev) => ({ ...prev, contact: e.target.value }))}
                  required
                  className="hh-input"
                  placeholder={
                    forgotPassword.loginAs === 'Admin'
                      ? 'Admin ID / Email / Phone'
                      : 'Registration ID / Email / Phone'
                  }
                />

                {otpRequested && (
                  <>
                    <input
                      value={forgotPassword.otp}
                      onChange={(e) => setForgotPassword((prev) => ({ ...prev, otp: e.target.value }))}
                      required
                      maxLength={6}
                      className="hh-input"
                      placeholder="Enter 6-digit OTP"
                    />
                    <input
                      type="password"
                      value={forgotPassword.newPassword}
                      onChange={(e) => setForgotPassword((prev) => ({ ...prev, newPassword: e.target.value }))}
                      required
                      className="hh-input"
                      placeholder="New Password"
                    />
                  </>
                )}

                <button type="submit" disabled={isLoading} className="hh-btn-danger w-full py-3 text-base disabled:opacity-70">
                  {isLoading ? 'Please wait...' : otpRequested ? 'Reset Password' : 'Send OTP'}
                </button>
              </form>

              {devOtp && (
                <p className="text-xs hh-muted">
                  Dev OTP preview: <span className="font-semibold text-[color:var(--hh-text)]">{devOtp}</span>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
