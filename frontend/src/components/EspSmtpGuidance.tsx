import Icon from './Icon';

export default function EspSmtpGuidance() {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-surface-800/40 p-5 space-y-5 text-sm text-neutral-300 leading-relaxed">
      <div>
        <h4 className="font-heading font-semibold text-neutral-100 mb-2 flex items-center gap-2">
          <Icon name="send" size={18} className="text-primary-400/80" />
          Raw SMTP (your Host, Google Workspace, etc.)
        </h4>
        <ul className="list-disc list-inside space-y-1.5 text-neutral-400">
          <li>You bring your own server credentials; SparkMailer sends through it (Nodemailer).</li>
          <li>Campaign “Sent” means the remote MTA accepted the message — not guaranteed inbox placement.</li>
          <li>Post-delivery bounces and complaints are invisible to SparkMailer unless you wire a provider that reports them (e.g. Mailgun webhooks).</li>
          <li>Best for: owned infrastructure, transactional-style sends, or when your host already signs mail (DKIM) at the edge.</li>
        </ul>
      </div>

      <div>
        <h4 className="font-heading font-semibold text-neutral-100 mb-2 flex items-center gap-2">
          <Icon name="api" size={18} className="text-primary-400/80" />
          ESP / Mailgun-style APIs
        </h4>
        <ul className="list-disc list-inside space-y-1.5 text-neutral-400">
          <li>
            When Mailgun (or similar) is configured at the server, webhooks can feed{' '}
            <strong className="text-neutral-300 font-medium">bounces, failures, and complaints</strong> back into Tracking — clearer
            distinction between SMTP accept and real delivery issues.
          </li>
          <li>Typically includes managed reputation, bounce processing, and event streams — at a cost per thousand emails.</li>
          <li>Best for: bulk marketing at scale where measurement and list hygiene feedback loops matter.</li>
        </ul>
      </div>

      <div className="rounded-md bg-surface-900/60 border border-primary-500/20 px-3 py-2.5 text-xs text-neutral-400">
        <strong className="text-primary-400/90 font-medium">Product stance:</strong> SparkMailer supports both paths. Use SMTP for
        flexibility; add an ESP integration when you need provider-attributed bounce/spam data in-app (see Tracking labels when
        webhooks are active).
      </div>
    </div>
  );
}
