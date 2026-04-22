import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';

const TYPING_LINES = [
  '> smtp.rotate() // health-weighted',
  '> campaign.send({ listId, templateId })',
  '> tracking.subscribe("opens", "bounces")',
  'const license = await activate(key);',
  'await transporter.verify(); // connected',
];

const TYPING_SPEED_MS = 45;
const LINE_PAUSE_MS = 1800;
const CURSOR_BLINK_MS = 530;

function HackerTypingBackground() {
  const [lineIndex, setLineIndex] = useState(0);
  const [visibleLength, setVisibleLength] = useState(0);
  const [phase, setPhase] = useState<'typing' | 'hold' | 'deleting'>('typing');

  const currentLine = TYPING_LINES[lineIndex] ?? '';
  const displayText = currentLine.slice(0, visibleLength);

  useEffect(() => {
    if (phase === 'typing') {
      if (visibleLength < currentLine.length) {
        const t = setTimeout(() => setVisibleLength((n) => n + 1), TYPING_SPEED_MS);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => setPhase('hold'), LINE_PAUSE_MS);
      return () => clearTimeout(t);
    }
    if (phase === 'hold') {
      const t = setTimeout(() => setPhase('deleting'), LINE_PAUSE_MS);
      return () => clearTimeout(t);
    }
    if (phase === 'deleting') {
      if (visibleLength > 0) {
        const t = setTimeout(() => setVisibleLength((n) => n - 1), TYPING_SPEED_MS / 2);
        return () => clearTimeout(t);
      }
      setPhase('typing');
      setLineIndex((i) => (i + 1) % TYPING_LINES.length);
    }
  }, [phase, visibleLength, currentLine.length]);

  const [cursorOn, setCursorOn] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setCursorOn((c) => !c), CURSOR_BLINK_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="fixed inset-0 overflow-hidden pointer-events-none select-none z-0"
      aria-hidden
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black via-black/95 to-black" />
      <div
        className="absolute left-4 sm:left-8 top-[18%] sm:top-[22%] font-mono text-xs sm:text-sm text-emerald-500/25 text-left max-w-[90vw] sm:max-w-md"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}
      >
        <span className="text-emerald-600/20">$ </span>
        <span>{displayText}</span>
        <span
          className={`inline-block w-2 h-4 ml-0.5 align-middle bg-emerald-500/50 ${cursorOn ? 'opacity-100' : 'opacity-0'}`}
          style={{ transition: 'opacity 0.05s' }}
        />
      </div>
      <div
        className="absolute right-4 sm:right-8 bottom-[30%] sm:bottom-[34%] font-mono text-xs text-cyan-500/20 text-right max-w-[80vw] sm:max-w-sm"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}
      >
        <div>$ queue.status</div>
        <div className="text-cyan-600/15">→ ready</div>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    title: 'Campaigns',
    description: 'Create, schedule, and send bulk email campaigns with templates and lists.',
    icon: 'campaign',
  },
  {
    title: 'Leads & Lists',
    description: 'Import contacts from paste or file (CSV, Excel). Manage lists and segment your audience.',
    icon: 'groups',
  },
  {
    title: 'Templates',
    description: 'Design HTML or plain-text templates with a live preview across device mockups.',
    icon: 'description',
  },
  {
    title: 'SMTP Rotation',
    description: 'Add multiple SMTP servers. Health-based rotation keeps deliverability high.',
    icon: 'sync_alt',
  },
  {
    title: 'Tracking',
    description: 'Monitor sends, opens, bounces, and unsubscribes in one place.',
    icon: 'monitoring',
  },
  {
    title: 'Support',
    description: 'Submit tickets, attach screenshots, and track responses from your dashboard.',
    icon: 'support_agent',
  },
];

const PLANS = [
  {
    name: 'Popular',
    price: 100,
    oneTime: true,
    features: [
      'License key access',
      '0–2,000 emails per day',
      'Valid for 12 months',
    ],
    cta: 'Get Popular',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: 250,
    oneTime: true,
    features: [
      'License key access',
      '0–5,000 emails per day',
      'All Popular features',
    ],
    cta: 'Get Pro',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 500,
    oneTime: false,
    features: [
      'License key access',
      '0–10,000 emails per day',
      'Valid for 12 months',
      'Duration bonus: longer subscription doubles usage limit',
    ],
    cta: 'Contact for Enterprise',
    highlighted: false,
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-black text-neutral-100 relative">
      <HackerTypingBackground />
      {/* Hero */}
      <header className="relative z-10 border-b border-white/[0.08] bg-grid-subtle bg-grid">
        <div className="max-w-6xl mx-auto px-6 py-16 sm:py-24">
          <div className="text-center max-w-3xl mx-auto">
            <Link to="/" className="inline-block mb-6">
              <img src="/logo.png" alt="SparkMailer" className="h-12 w-auto object-contain mx-auto" />
            </Link>
            <h1 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight text-neutral-50">
              Bulk Email Marketing Software
            </h1>
            <p className="mt-4 text-lg text-neutral-400 font-sans">
              Send campaigns, manage leads, rotate SMTP servers, and track delivery—all in one place.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link
                to="/activate"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary-500 text-white font-semibold hover:bg-primary-600 transition-colors"
              >
                Activate license
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-white/20 text-neutral-200 hover:bg-white/[0.06] transition-colors font-medium"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Features */}
      <section className="relative z-10 border-b border-white/[0.08] py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="font-heading text-2xl sm:text-3xl font-bold text-center text-neutral-100 tracking-tight mb-2">
            Everything you need to send at scale
          </h2>
          <p className="text-center text-neutral-500 font-sans mb-12 max-w-xl mx-auto">
            Campaigns, lists, templates, SMTP rotation, tracking, and support—built into one software.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="tactical-card rounded-xl p-6 border-t-2 border-t-primary-500/30 hover:border-t-primary-500/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-primary-500/20 flex items-center justify-center mb-4">
                  <Icon name={f.icon} size={22} className="text-primary-400" />
                </div>
                <h3 className="font-heading font-semibold text-lg text-neutral-100 tracking-tight">{f.title}</h3>
                <p className="mt-2 text-sm text-neutral-400 font-sans leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="relative z-10 py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="font-heading text-2xl sm:text-3xl font-bold text-center text-neutral-100 tracking-tight mb-2">
            Simple, one-time pricing
          </h2>
          <p className="text-center text-neutral-500 font-sans mb-12 max-w-xl mx-auto">
            Choose a plan. Activate with a license key. Start sending.
          </p>
          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`tactical-card rounded-xl p-6 sm:p-8 flex flex-col ${
                  plan.highlighted
                    ? 'border-2 border-primary-500/50 ring-2 ring-primary-500/20 relative'
                    : 'border-t-2 border-t-primary-500/30'
                }`}
              >
                {plan.highlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-semibold bg-primary-500/20 text-primary-400 border border-primary-500/30">
                    Recommended
                  </span>
                )}
                <h3 className="font-heading font-semibold text-xl text-neutral-100 tracking-tight">{plan.name} Plan</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-neutral-50">${plan.price}</span>
                  <span className="text-neutral-500 font-sans text-sm">
                    {plan.oneTime ? 'one-time' : '/ 12 months'}
                  </span>
                </div>
                <ul className="mt-6 space-y-3 flex-1">
                  {plan.features.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-neutral-300 font-sans">
                      <Icon name="check_circle" size={18} className="text-primary-500/80 shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/contact"
                  className={`mt-8 block text-center py-3 px-4 rounded-lg font-semibold transition-colors ${
                    plan.highlighted
                      ? 'bg-primary-500 text-white hover:bg-primary-600'
                      : 'border border-white/20 text-neutral-200 hover:bg-white/[0.06]'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <footer className="relative z-10 border-t border-white/[0.08] py-12">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <p className="text-neutral-500 font-sans text-sm">
            <Link to="/contact" className="text-primary-400 hover:text-primary-300 font-medium">
              Contact
            </Link>
            {' · '}
            <Link to="/login" className="text-primary-400 hover:text-primary-300 font-medium">
              Sign in
            </Link>
            {' · '}
            <Link to="/activate" className="text-primary-400 hover:text-primary-300 font-medium">
              Activate license
            </Link>
            {' · '}
            <Link to="/status" className="text-primary-400 hover:text-primary-300 font-medium">
              Status
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
