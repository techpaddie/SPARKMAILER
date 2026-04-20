import { resolveTxt } from 'dns/promises';

async function bestEffortTxt(name: string): Promise<string[]> {
  try {
    const records = await resolveTxt(name);
    return records.map((chunks) => chunks.join(''));
  } catch {
    return [];
  }
}

export type DomainDnsCheck = {
  domain: string;
  spf: { present: boolean; record: string | null };
  dmarc: { present: boolean; record: string | null; policy: string | null };
  /** DKIM is provider-specific; we cannot verify without selector — UI shows hint. */
  dkim: { verifiableInApp: boolean; hint: string };
};

function parseDmarcPolicy(record: string): string | null {
  const m = record.match(/\bp=(\w+)/i);
  return m?.[1]?.toLowerCase() ?? null;
}

export async function checkDomainDns(domain: string): Promise<DomainDnsCheck> {
  const d = domain.trim().toLowerCase().replace(/^\.+|\.+$/g, '');
  const rootTxts = await bestEffortTxt(d);
  const spfRecord = rootTxts.find((t) => t.toLowerCase().includes('v=spf1')) ?? null;

  const dmarcTxts = await bestEffortTxt(`_dmarc.${d}`);
  const dmarcRecord = dmarcTxts.find((t) => t.toLowerCase().includes('v=dmarc1')) ?? null;
  const policy = dmarcRecord ? parseDmarcPolicy(dmarcRecord) : null;

  return {
    domain: d,
    spf: { present: !!spfRecord, record: spfRecord },
    dmarc: { present: !!dmarcRecord, record: dmarcRecord, policy },
    dkim: {
      verifiableInApp: false,
      hint: 'DKIM is published by your mail host (selector-specific). Confirm in your provider’s DNS or dashboard.',
    },
  };
}
