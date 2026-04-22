import { useMemo, useState } from 'react';
import { api } from '../services/api';

type CookiePrefs = {
  consentVersion: string;
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  action: 'accept_all' | 'reject_optional' | 'custom_save' | 'update';
  source: 'banner' | 'settings';
};

const STORAGE_KEY = 'sparkmailer-cookie-consent-v1';

function loadPrefs(): CookiePrefs | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<CookiePrefs>;
    if (typeof p.analytics !== 'boolean' || typeof p.marketing !== 'boolean') return null;
    return {
      consentVersion: 'v1',
      necessary: true,
      analytics: p.analytics,
      marketing: p.marketing,
      action: p.action === 'update' ? 'update' : 'custom_save',
      source: 'settings',
    };
  } catch {
    return null;
  }
}

function savePrefs(prefs: CookiePrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export default function CookieConsentManager() {
  const existing = useMemo(() => loadPrefs(), []);
  const [open, setOpen] = useState(!existing);
  const [analytics, setAnalytics] = useState(existing?.analytics ?? false);
  const [marketing, setMarketing] = useState(existing?.marketing ?? false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const submit = async (prefs: CookiePrefs) => {
    setSaving(true);
    try {
      savePrefs(prefs);
      await api.post('/cookies/consent', {
        ...prefs,
        pageUrl: window.location.href,
        referrer: document.referrer || undefined,
        locale: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setSavedAt(new Date());
      setOpen(false);
    } catch {
      // Keep local settings even if backend logging fails.
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {open ? (
        <div className="fixed bottom-4 left-4 right-4 md:right-auto md:w-[520px] z-[80] bg-surface-900 border border-white/10 rounded-xl shadow-xl p-4">
          <h3 className="text-neutral-100 font-semibold text-base">Cookie preferences</h3>
          <p className="text-neutral-400 text-sm mt-1">
            We use essential cookies for security and optional cookies for analytics and marketing.
          </p>

          <div className="mt-4 space-y-3">
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked disabled className="mt-0.5" />
              <span>
                <span className="text-neutral-200 font-medium">Necessary</span>
                <span className="block text-neutral-500">Required for authentication and core app security.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} className="mt-0.5" />
              <span>
                <span className="text-neutral-200 font-medium">Analytics</span>
                <span className="block text-neutral-500">Helps us understand performance and usage patterns.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-0.5" />
              <span>
                <span className="text-neutral-200 font-medium">Marketing</span>
                <span className="block text-neutral-500">Used to improve outreach and campaign relevance.</span>
              </span>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                submit({
                  consentVersion: 'v1',
                  necessary: true,
                  analytics: true,
                  marketing: true,
                  action: existing ? 'update' : 'accept_all',
                  source: 'banner',
                })
              }
              className="tactical-btn-primary rounded text-sm disabled:opacity-60"
            >
              Accept all
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                submit({
                  consentVersion: 'v1',
                  necessary: true,
                  analytics: false,
                  marketing: false,
                  action: existing ? 'update' : 'reject_optional',
                  source: 'banner',
                })
              }
              className="tactical-btn-ghost rounded text-sm disabled:opacity-60"
            >
              Reject optional
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                submit({
                  consentVersion: 'v1',
                  necessary: true,
                  analytics,
                  marketing,
                  action: existing ? 'update' : 'custom_save',
                  source: existing ? 'settings' : 'banner',
                })
              }
              className="px-3 py-2 text-sm rounded bg-surface-700 text-neutral-200 hover:bg-surface-600 disabled:opacity-60"
            >
              Save preferences
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-[70] px-3 py-2 rounded-full bg-surface-800 border border-white/10 text-neutral-300 text-xs hover:bg-surface-700"
        title={savedAt ? `Preferences saved at ${savedAt.toLocaleTimeString()}` : 'Manage cookie preferences'}
      >
        Cookie settings
      </button>
    </>
  );
}
