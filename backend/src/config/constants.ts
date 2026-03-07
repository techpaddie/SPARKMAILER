export const LICENSE_STATUS = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  REVOKED: 'REVOKED',
  EXPIRED: 'EXPIRED',
} as const;

export const USER_ROLE = {
  ADMIN: 'ADMIN',
  USER: 'USER',
} as const;

export const CAMPAIGN_STATUS = {
  DRAFT: 'DRAFT',
  QUEUED: 'QUEUED',
  SENDING: 'SENDING',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

export const EMAIL_EVENT_TYPES = {
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  OPENED: 'OPENED',
  CLICKED: 'CLICKED',
  BOUNCED: 'BOUNCED',
  FAILED: 'FAILED',
  UNSUBSCRIBED: 'UNSUBSCRIBED',
  SPAM: 'SPAM',
} as const;

export const QUEUE_NAMES = {
  EMAIL_SEND: 'email-send',
  CAMPAIGN_PROCESS: 'campaign-process',
} as const;
