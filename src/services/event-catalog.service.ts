import type { EmailTemplateKey } from '../mail/templates';

export type NotificationEventType =
  | 'invitation.created'
  | 'invitation.accepted'
  | 'invitation.declined'
  | 'invitation.expiring'
  | 'appointment.created'
  | 'appointment.updated'
  | 'appointment.canceled'
  | 'document.shared'
  | 'run_sheet.published'
  | 'task.assigned'
  | 'password.reset'
  | 'account.welcome'
  | 'message.created';

type EventCatalogEntry = {
  pushLabel: string;
  emailTemplate: EmailTemplateKey;
  defaultPushEnabled: boolean;
  defaultEmailEnabled: boolean;
  criticalEmail: boolean;
};

/**
 * Shared event catalog for email + push pipelines (7.1.2 + 7.2.3)
 */
export const EventCatalog: Record<NotificationEventType, EventCatalogEntry> = {
  'invitation.created': {
    pushLabel: 'invitation',
    emailTemplate: 'SUPPLIER_INVITATION_FLOW_A',
    defaultPushEnabled: true,
    defaultEmailEnabled: true,
    criticalEmail: false,
  },
  'invitation.accepted': {
    pushLabel: 'invitation update',
    emailTemplate: 'INVITATION_ACCEPTED',
    defaultPushEnabled: true,
    defaultEmailEnabled: true,
    criticalEmail: false,
  },
  'invitation.declined': {
    pushLabel: 'invitation update',
    emailTemplate: 'INVITATION_DECLINED',
    defaultPushEnabled: true,
    defaultEmailEnabled: true,
    criticalEmail: false,
  },
  'invitation.expiring': {
    pushLabel: 'invitation reminder',
    emailTemplate: 'INVITATION_EXPIRY_REMINDER',
    defaultPushEnabled: true,
    defaultEmailEnabled: true,
    criticalEmail: false,
  },
  'appointment.created': {
    pushLabel: 'appointment',
    emailTemplate: 'APPOINTMENT_CREATED',
    defaultPushEnabled: true,
    defaultEmailEnabled: true,
    criticalEmail: false,
  },
  'appointment.updated': {
    pushLabel: 'appointment',
    emailTemplate: 'APPOINTMENT_UPDATED',
    defaultPushEnabled: true,
    defaultEmailEnabled: true,
    criticalEmail: false,
  },
  'appointment.canceled': {
    pushLabel: 'appointment',
    emailTemplate: 'APPOINTMENT_CANCELED',
    defaultPushEnabled: true,
    defaultEmailEnabled: true,
    criticalEmail: false,
  },
  'document.shared': {
    pushLabel: 'document',
    emailTemplate: 'DOCUMENT_SHARED',
    defaultPushEnabled: true,
    defaultEmailEnabled: true,
    criticalEmail: false,
  },
  'run_sheet.published': {
    pushLabel: 'run-of-show',
    emailTemplate: 'ROS_PUBLISHED',
    defaultPushEnabled: true,
    defaultEmailEnabled: true,
    criticalEmail: false,
  },
  'task.assigned': {
    pushLabel: 'task',
    emailTemplate: 'TASK_ASSIGNED',
    defaultPushEnabled: true,
    defaultEmailEnabled: true,
    criticalEmail: false,
  },
  'password.reset': {
    pushLabel: 'security',
    emailTemplate: 'PASSWORD_RESET',
    defaultPushEnabled: false,
    defaultEmailEnabled: true,
    criticalEmail: true,
  },
  'account.welcome': {
    pushLabel: 'account',
    emailTemplate: 'ACCOUNT_WELCOME',
    defaultPushEnabled: false,
    defaultEmailEnabled: true,
    criticalEmail: true,
  },
  'message.created': {
    pushLabel: 'message',
    emailTemplate: 'TASK_ASSIGNED',
    defaultPushEnabled: true,
    defaultEmailEnabled: false,
    criticalEmail: false,
  },
};
