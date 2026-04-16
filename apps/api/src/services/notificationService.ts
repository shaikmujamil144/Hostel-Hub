import { io } from '../index';
import { Notification, NotificationType } from '../models/Notification';

type CreateNotificationInput = {
  tenantId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  recipientUserId?: string;
  metadata?: Record<string, any>;
};

export const createTenantNotification = async (input: CreateNotificationInput) => {
  const notification = await Notification.create({
    hostelId: input.tenantId,
    recipient: input.recipientUserId,
    type: input.type,
    title: input.title,
    message: input.message,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: input.metadata,
  });

  io.to(`tenant:${input.tenantId}`).emit('notification', notification);
  return notification;
};
