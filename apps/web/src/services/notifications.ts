import api from './api';

export interface NotificationItem {
  _id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

interface NotificationResponse {
  data: NotificationItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const fetchNotifications = async (params?: { page?: number; limit?: number; unreadOnly?: boolean }) => {
  const response = await api.get<NotificationResponse>('/notifications', {
    params: {
      page: params?.page ?? 1,
      limit: params?.limit ?? 10,
      unreadOnly: params?.unreadOnly ?? false,
    },
  });

  return response.data;
};

export const markNotificationRead = async (id: string) => {
  const response = await api.patch(`/notifications/${id}/read`);
  return response.data;
};

export const markAllNotificationsRead = async () => {
  const response = await api.patch('/notifications/mark-all-read');
  return response.data;
};
