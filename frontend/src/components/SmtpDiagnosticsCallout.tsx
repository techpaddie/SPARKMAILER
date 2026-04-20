import { classifySmtpError, smtpDiagnosticsBadgeParts, type SmtpErrorMeta } from '../utils/smtpErrorDiagnostics';

type Props = {
  message: string;
  smtp?: Partial<SmtpErrorMeta> | null;
};

function categoryAccent(category: string): string {
  switch (category) {
    case 'authentication':
      return 'border-amber-500/40 bg-amber-950/25';
    case 'rate_limit':
      return 'border-violet-500/35 bg-violet-950/20';
    case 'connection':
    case 'tls':
      return 'border-sky-500/35 bg-sky-950/20';
    case 'policy_recipient':
    case 'policy_content':
      return 'border-orange-500/35 bg-orange-950/20';
    case 'server_error':
      return 'border-red-500/35 bg-red-950/25';
    default:
      return 'border-white/10 bg-black/25';
  }
}

/**
 * Human-readable SMTP failure breakdown (Nodemailer responseCode / code + heuristics).
 */
export function SmtpDiagnosticsCallout({ message, smtp }: Props) {
  const diag = classifySmtpError({
    message,
    responseCode: smtp?.responseCode ?? null,
    code: smtp?.code ?? null,
    response: smtp?.response ?? null,
    command: smtp?.command ?? null,
  });
  const badges = smtpDiagnosticsBadgeParts(diag);

  return (
    <div className={`mt-2 rounded-md border px-3 py-2.5 text-left ${categoryAccent(diag.category)}`}>
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{diag.label}</span>
        {badges.map((b) => (
          <span
            key={b}
            className="rounded px-1.5 py-0.5 text-[10px] font-mono bg-black/40 text-neutral-200 border border-white/10"
          >
            {b}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-neutral-200 leading-snug font-sans font-medium">{diag.summary}</p>
      {diag.hints.length > 0 && (
        <ul className="mt-2 space-y-1 text-[10px] text-neutral-400 font-sans list-disc pl-4">
          {diag.hints.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}
      {(smtp?.response || smtp?.command) && (
        <div className="mt-2 pt-2 border-t border-white/5 space-y-1 font-mono text-[10px] text-neutral-500 break-all">
          {smtp.command ? <div>Command: {smtp.command}</div> : null}
          {smtp.response ? <div>Response: {smtp.response}</div> : null}
        </div>
      )}
    </div>
  );
}
