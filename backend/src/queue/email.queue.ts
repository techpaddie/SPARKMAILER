import { Queue } from 'bullmq';
import { env } from '../config';
import { QUEUE_NAMES } from '../config/constants';

const connection = {
  host: new URL(env.REDIS_URL).hostname,
  port: parseInt(new URL(env.REDIS_URL).port || '6379', 10),
  maxRetriesPerRequest: null,
};

export interface EmailJobData {
  campaignId: string;
  recipientId: string;
  contactId: string;
  email: string;
  subject: string;
  html: string;
  text?: string;
  fromEmail: string;
  fromName?: string;
  replyTo?: string;
  userId: string;
  attachments?: { filename: string; contentType: string; content: string }[];
}

export const emailQueue = new Queue<EmailJobData>(QUEUE_NAMES.EMAIL_SEND, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      age: 3600,
      count: 10000,
    },
  },
});

export async function addEmailJob(data: EmailJobData) {
  return emailQueue.add('send', data, {
    jobId: `${data.campaignId}-${data.recipientId}`,
  });
}

export async function addEmailBatch(data: EmailJobData[]) {
  const jobs = data.map((d) => ({
    name: 'send' as const,
    data: d,
    opts: { jobId: `${d.campaignId}-${d.recipientId}` },
  }));
  return emailQueue.addBulk(jobs);
}
