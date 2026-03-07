import { env } from '../config';

const MAILGUN_BASE = 'https://api.mailgun.net';

type MailgunStatsPoint = {
  time: string;
  accepted?: { total?: number; outgoing?: number };
  delivered?: { smtp?: number; http?: number; optimized?: number; total?: number };
  failed?: {
    temporary?: { total?: number };
    permanent?: { bounce?: number; 'delayed-bounce'?: number; total?: number };
  };
};

type MailgunStatsResponse = {
  stats?: MailgunStatsPoint[];
};

type MailgunQueueResponse = {
  regular?: { is_disabled?: boolean; disabled?: { reason?: string; until?: string } };
  scheduled?: unknown;
};

function getAuthHeader(): string {
  const key = env.MAILGUN_API_KEY ?? '';
  return Buffer.from(`api:${key}`).toString('base64');
}

async function mailgunFetch<T>(path: string, params?: Record<string, string | string[]>) {
  const url = new URL(path, MAILGUN_BASE);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (Array.isArray(v)) v.forEach((val) => url.searchParams.append(k, val));
      else url.searchParams.set(k, v);
    });
  }
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Basic ${getAuthHeader()}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mailgun API ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export type MailgunStats = {
  configured: boolean;
  queue?: {
    regularDisabled: boolean;
    disabledReason?: string;
    disabledUntil?: string;
  };
  sent?: number;
  delivered?: number;
  failed?: number;
  deliveryRatePercent?: number;
  error?: string;
};

export async function getMailgunStats(): Promise<MailgunStats> {
  const key = env.MAILGUN_API_KEY;
  const domain = env.MAILGUN_DOMAIN;
  if (!key || !domain) {
    return { configured: false };
  }

  const out: MailgunStats = { configured: true };

  try {
    const [statsRes, queueRes] = await Promise.allSettled([
      mailgunFetch<MailgunStatsResponse>(`/v3/${encodeURIComponent(domain)}/stats/total`, {
        event: ['accepted', 'delivered', 'failed'],
        duration: '1d',
        resolution: 'day',
      }),
      mailgunFetch<MailgunQueueResponse>(`/v3/domains/${encodeURIComponent(domain)}/sending_queues`),
    ]);

    if (queueRes.status === 'fulfilled' && queueRes.value) {
      const q = queueRes.value.regular;
      out.queue = {
        regularDisabled: q?.is_disabled ?? false,
        disabledReason: q?.disabled?.reason,
        disabledUntil: q?.disabled?.until,
      };
    }

    if (statsRes.status === 'fulfilled' && statsRes.value?.stats?.length) {
      const points = statsRes.value.stats;
      let accepted = 0;
      let delivered = 0;
      let failed = 0;
      for (const p of points) {
        accepted += p.accepted?.total ?? p.accepted?.outgoing ?? 0;
        const d = p.delivered;
        delivered += (d?.total ?? 0) || (d?.smtp ?? 0) + (d?.http ?? 0) + (d?.optimized ?? 0);
        const f = p.failed;
        failed += (f?.permanent?.bounce ?? 0) + (f?.permanent?.['delayed-bounce'] ?? 0) + (f?.permanent?.total ?? 0) + (f?.temporary?.total ?? 0);
      }
      out.sent = accepted;
      out.delivered = delivered;
      out.failed = failed;
      out.deliveryRatePercent = accepted > 0 ? Math.round((delivered / accepted) * 100) : undefined;
    } else if (statsRes.status === 'rejected') {
      out.error = statsRes.reason?.message ?? 'Failed to fetch Mailgun stats';
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : 'Mailgun request failed';
  }

  return out;
}
