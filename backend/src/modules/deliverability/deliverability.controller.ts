import { Response } from 'express';
import { prisma } from '../../utils/prisma';
import { checkDomainDns } from '../../services/deliverability-dns.service';
import type { AuthenticatedRequest } from '../../middleware/types';

function domainFromFromEmail(fromEmail: string): string | null {
  const at = fromEmail.lastIndexOf('@');
  if (at < 0) return null;
  const d = fromEmail.slice(at + 1).trim().toLowerCase();
  return d || null;
}

/** DNS checks for each unique From-domain on the user’s SMTP profiles (max 12 domains). */
export async function getSummary(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.id;
  const servers = await prisma.smtpServer.findMany({
    where: { userId },
    select: { fromEmail: true, name: true },
  });

  const domainSet = new Map<string, { fromEmails: string[]; serverNames: string[] }>();
  for (const s of servers) {
    const d = domainFromFromEmail(s.fromEmail);
    if (!d) continue;
    const cur = domainSet.get(d) ?? { fromEmails: [], serverNames: [] };
    if (!cur.fromEmails.includes(s.fromEmail)) cur.fromEmails.push(s.fromEmail);
    if (!cur.serverNames.includes(s.name)) cur.serverNames.push(s.name);
    domainSet.set(d, cur);
  }

  const domains = [...domainSet.entries()].slice(0, 12);
  const checks = await Promise.all(
    domains.map(async ([domain, meta]) => {
      const dns = await checkDomainDns(domain);
      return {
        ...dns,
        fromEmails: meta.fromEmails,
        serverLabels: meta.serverNames,
      };
    })
  );

  res.json({
    domains: checks,
    empty: checks.length === 0,
    message:
      checks.length === 0
        ? 'Add an SMTP server with a From address to run DNS checks for that domain.'
        : undefined,
  });
}

/** Optional: check an arbitrary domain (must match a From domain on one of the user’s SMTP servers). */
export async function getDomainCheck(req: AuthenticatedRequest, res: Response) {
  const raw = typeof req.query.domain === 'string' ? req.query.domain.trim() : '';
  if (!raw) {
    res.status(400).json({ error: 'Query ?domain= is required' });
    return;
  }
  const userId = req.user!.id;
  const want = raw.toLowerCase().replace(/^\.+|\.+$/g, '');
  const servers = await prisma.smtpServer.findMany({
    where: { userId },
    select: { fromEmail: true },
  });
  const allowed = servers.some((s) => domainFromFromEmail(s.fromEmail) === want);
  if (!allowed) {
    res.status(403).json({ error: 'Domain must match the From address of one of your SMTP servers.' });
    return;
  }
  const dns = await checkDomainDns(raw);
  res.json(dns);
}
