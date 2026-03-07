import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';

const TELEGRAM_HANDLE = 'xann3k';
const SUPPORT_EMAIL = 'slattybenzo@protonmail.com';

export default function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !email.trim() || !message.trim()) {
      setError('Please fill in name, email, and message.');
      return;
    }
    const subj = subject.trim() || 'Contact form submission';
    const body = [
      `From: ${name.trim()} <${email.trim()}>`,
      '',
      message.trim(),
    ].join('\n');
    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    setSubmitted(true);
  };

  const telegramUrl = TELEGRAM_HANDLE.startsWith('http')
    ? TELEGRAM_HANDLE
    : `https://t.me/${TELEGRAM_HANDLE.replace(/^@/, '')}`;

  return (
    <div className="min-h-screen bg-black text-neutral-100">
      <div className="max-w-2xl mx-auto px-6 py-12 sm:py-16">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-300 font-medium mb-8"
        >
          <Icon name="arrow_back" size={18} />
          Back to home
        </Link>

        <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight text-neutral-50 mb-2">
          Contact & support
        </h1>
        <p className="text-neutral-500 font-sans mb-10">
          Send a message through the form or reach us on Telegram for payments and quick questions.
        </p>

        <div className="grid sm:grid-cols-1 gap-10">
          {/* Contact form */}
          <section className="tactical-card rounded-xl border-t-2 border-t-primary-500/40 p-6 sm:p-8">
            <h2 className="font-heading text-lg font-semibold text-neutral-100 flex items-center gap-2 tracking-tight mb-4">
              <Icon name="mail" size={22} className="text-primary-500/80" />
              Contact form
            </h2>
            {submitted ? (
              <div className="rounded-lg bg-primary-500/10 border border-primary-500/20 p-6 text-center">
                <Icon name="check_circle" size={48} className="text-primary-400 mx-auto mb-3" />
                <p className="font-medium text-neutral-100">Message received</p>
                <p className="text-sm text-neutral-500 mt-1">
                  Your email client should have opened to send to {SUPPORT_EMAIL}. If it didn’t, email us there directly. We’ll get back to you at <strong className="text-neutral-300">{email}</strong>. For payments or faster replies, use Telegram below.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="tactical-label normal-case text-neutral-400 block mb-1.5">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="tactical-input w-full"
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label className="tactical-label normal-case text-neutral-400 block mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="tactical-input w-full"
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label className="tactical-label normal-case text-neutral-400 block mb-1.5">Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="tactical-input w-full"
                    placeholder="Support, payment, or general inquiry"
                  />
                </div>
                <div>
                  <label className="tactical-label normal-case text-neutral-400 block mb-1.5">Message</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={5}
                    className="tactical-input w-full resize-none"
                    placeholder="How can we help?"
                  />
                </div>
                {error && <p className="text-red-400 text-sm font-medium">{error}</p>}
                <button
                  type="submit"
                  className="tactical-btn-primary rounded-lg w-full sm:w-auto px-6 py-3"
                >
                  Send message
                </button>
              </form>
            )}
          </section>

          {/* Telegram for payment */}
          <section className="tactical-card rounded-xl border-t-2 border-t-cyan-500/40 p-6 sm:p-8">
            <h2 className="font-heading text-lg font-semibold text-neutral-100 flex items-center gap-2 tracking-tight mb-2">
              <span className="text-2xl" aria-hidden>✈</span>
              Telegram – payments & quick support
            </h2>
            <p className="text-sm text-neutral-500 font-sans mb-6">
              For license purchases, invoicing, or fast replies, message us on Telegram.
            </p>
            <a
              href={telegramUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-3 px-5 py-3 rounded-lg bg-[#0088cc]/20 border border-[#0088cc]/40 text-cyan-300 hover:bg-[#0088cc]/30 transition-colors font-medium"
            >
              <span className="text-xl" aria-hidden>✈</span>
              Open Telegram
            </a>
          </section>
        </div>

        <p className="mt-10 text-center text-sm text-neutral-500">
          <Link to="/" className="text-primary-400 hover:text-primary-300 font-medium">
            Back to home
          </Link>
          {' · '}
          <Link to="/login" className="text-primary-400 hover:text-primary-300 font-medium">
            Sign in
          </Link>
          {' · '}
          <Link to="/activate" className="text-primary-400 hover:text-primary-300 font-medium">
            Activate license
          </Link>
        </p>
      </div>
    </div>
  );
}
