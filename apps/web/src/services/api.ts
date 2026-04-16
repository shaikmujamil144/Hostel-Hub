import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

// Request interceptor to attach JWT token
api.interceptors.request.use(
  (config) => {
    const userInfo = localStorage.getItem('userInfo');
    if (userInfo) {
      const parsed = JSON.parse(userInfo);
      if (parsed.token) {
        config.headers.Authorization = `Bearer ${parsed.token}`;
      }
      if (parsed.role === 'Admin') {
        const activeHostelId = localStorage.getItem('activeHostelId');
        if (activeHostelId) {
          config.headers['x-tenant-id'] = activeHostelId;
        }
      } else if (parsed.hostelId) {
        config.headers['x-tenant-id'] = parsed.hostelId;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      localStorage.removeItem('userInfo');
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
