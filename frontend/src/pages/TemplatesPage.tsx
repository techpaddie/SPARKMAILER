import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import Icon from '../components/Icon';
import { ScrollableListRegion } from '../components/ScrollableListRegion';

function isHtml(content: string): boolean {
  const t = content.trim();
  return /<[a-z][\s\S]*>/i.test(t) || /<\/[a-z]+>/i.test(t);
}

function buildPreviewDocument(htmlBody: string): string {
  const safe = htmlBody.replace(/<\/body>/gi, '').replace(/<\/html>/gi, '');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>body{margin:0;padding:14px 16px;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1a1a1a;background:#fff;-webkit-text-size-adjust:100%}img{max-width:100%;height:auto}a{color:#0066cc}</style></head><body>${safe}</body></html>`;
}

type DeviceType = 'iphone' | 'ipad' | 'desktop';

const EmptyPreview = () => (
  <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-4 bg-gradient-to-b from-slate-50 to-white px-6 text-center">
    <div className="rounded-xl bg-surface-700/80 border border-white/10 p-4 shadow-lg">
      <Icon name="mail" size={40} className="text-primary-500/70" />
    </div>
    <div>
      <p className="text-sm font-heading font-semibold text-neutral-600">Template Preview</p>
      <p className="mt-1 text-xs text-neutral-500">Click <strong>Preview</strong> on a template or <strong>Edit</strong> for live preview.</p>
    </div>
  </div>
);

function PreviewFrame({ htmlContent, isEmpty, srcdoc }: { htmlContent: string; isEmpty: boolean; srcdoc: string }) {
  if (isEmpty) return <EmptyPreview />;
  return (
    <iframe
      key={`${htmlContent.length}-${htmlContent.slice(0, 80)}`}
      title="Template preview"
      srcDoc={srcdoc}
      className="h-full w-full border-0"
      sandbox="allow-same-origin"
      style={{ display: 'block' }}
    />
  );
}

function IPhone16Mockup({ htmlContent, isEmpty }: { htmlContent: string; isEmpty: boolean }) {
  const srcdoc = useMemo(() => {
    if (isEmpty) return '';
    const body = htmlContent.trim() || '<p class="text-slate-500">No content</p>';
    return buildPreviewDocument(body);
  }, [htmlContent, isEmpty]);

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative flex flex-col items-center justify-center rounded-[3.25rem] p-[10px]"
        style={{
          width: 'min(284px, 88vw)',
          background: 'linear-gradient(145deg, #2c2c2e 0%, #1c1c1e 50%, #0d0d0f 100%)',
          boxShadow: '0 0 0 3px rgba(255,255,255,0.04), 0 0 0 1px rgba(0,0,0,0.5), 0 32px 64px -12px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      >
        <div className="absolute left-0 top-[120px] w-[3px] rounded-r bg-neutral-600" style={{ height: 28 }} />
        <div
          className="relative w-full overflow-hidden rounded-[2.35rem] bg-black"
          style={{ aspectRatio: '393 / 852', maxHeight: 'min(612px, 76vh)' }}
        >
          <div
            className="absolute left-1/2 top-[11px] z-10 -translate-x-1/2 rounded-full bg-black"
            style={{ width: 120, height: 34, boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.1)' }}
          />
          <div
            className="absolute inset-x-[6px] top-[52px] bottom-[8px] overflow-hidden rounded-b-[1.75rem] bg-white"
            style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
          >
            <PreviewFrame htmlContent={htmlContent} isEmpty={isEmpty} srcdoc={srcdoc} />
          </div>
        </div>
      </div>
    </div>
  );
}

function IPadMockup({ htmlContent, isEmpty }: { htmlContent: string; isEmpty: boolean }) {
  const srcdoc = useMemo(() => {
    if (isEmpty) return '';
    const body = htmlContent.trim() || '<p class="text-slate-500">No content</p>';
    return buildPreviewDocument(body);
  }, [htmlContent, isEmpty]);

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative flex flex-col items-center rounded-[2rem] p-4"
        style={{
          width: 'min(520px, 95vw)',
          background: 'linear-gradient(165deg, #1a1a1c 0%, #0f0f11 100%)',
          boxShadow: '0 0 0 2px rgba(255,255,255,0.06), 0 24px 48px -8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        {/* Top camera */}
        <div
          className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-neutral-800"
          style={{ width: 10, height: 10 }}
        />
        <div
          className="relative w-full overflow-hidden rounded-[1.5rem] bg-black"
          style={{
            aspectRatio: '4 / 3',
            maxHeight: 'min(520px, 65vh)',
          }}
        >
          <div className="absolute inset-[8px] overflow-hidden rounded-[1.25rem] bg-white">
            <PreviewFrame htmlContent={htmlContent} isEmpty={isEmpty} srcdoc={srcdoc} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DesktopMockup({ htmlContent, isEmpty }: { htmlContent: string; isEmpty: boolean }) {
  const srcdoc = useMemo(() => {
    if (isEmpty) return '';
    const body = htmlContent.trim() || '<p class="text-slate-500">No content</p>';
    return buildPreviewDocument(body);
  }, [htmlContent, isEmpty]);

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative flex flex-col items-center"
        style={{
          width: 'min(720px, 98vw)',
        }}
      >
        {/* Monitor bezel */}
        <div
          className="relative w-full overflow-hidden rounded-t-xl"
          style={{
            background: 'linear-gradient(180deg, #252528 0%, #1a1a1d 100%)',
            boxShadow: '0 0 0 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)',
            padding: '12px 12px 8px',
          }}
        >
          {/* Webcam */}
          <div
            className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full bg-neutral-900"
            style={{ width: 8, height: 8 }}
          />
          {/* Screen */}
          <div
            className="relative w-full overflow-hidden rounded-lg bg-black"
            style={{
              aspectRatio: '16 / 10',
              maxHeight: 'min(480px, 55vh)',
            }}
          >
            <div className="absolute inset-0 overflow-hidden rounded-lg bg-white">
              <PreviewFrame htmlContent={htmlContent} isEmpty={isEmpty} srcdoc={srcdoc} />
            </div>
          </div>
        </div>
        {/* Stand */}
        <div
          className="h-6 w-24 rounded-b-md"
          style={{
            background: 'linear-gradient(180deg, #1e1e21 0%, #151518 100%)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        />
      </div>
    </div>
  );
}

type TabId = 'all' | 'viewer';

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>('all');
  const [viewerDevice, setViewerDevice] = useState<DeviceType>('desktop');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');

  const { data: templates = [], isLoading } = useQuery(
    ['templates'],
    () => api.get('/templates').then((r) => r.data)
  );
  const { data: editingTemplate } = useQuery(
    ['template', editingId],
    () => api.get(`/templates/${editingId}`).then((r) => r.data),
    { enabled: !!editingId }
  );
  const { data: previewTemplate } = useQuery(
    ['template', 'preview', previewId],
    () => api.get(`/templates/${previewId}`).then((r) => r.data),
    { enabled: !!previewId }
  );

  useEffect(() => {
    if (editingTemplate) {
      setName(editingTemplate.name);
      setSubject(editingTemplate.subject ?? '');
      setContent(editingTemplate.htmlContent || editingTemplate.textContent || '');
      setError('');
    }
  }, [editingTemplate]);

  const createTemplate = useMutation(
    (payload: { name: string; subject?: string; htmlContent: string; textContent?: string }) =>
      api.post('/templates', payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['templates']);
        resetForm();
      },
      onError: (err: { response?: { data?: { error?: unknown } } }) => {
        setError(String(err.response?.data?.error ?? 'Failed to create'));
      },
    }
  );
  const updateTemplate = useMutation(
    ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      api.patch(`/templates/${id}`, payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['templates']);
        queryClient.invalidateQueries(['template', editingId ?? '']);
        resetForm();
      },
      onError: (err: { response?: { data?: { error?: unknown } } }) => {
        setError(String(err.response?.data?.error ?? 'Failed to update'));
      },
    }
  );
  const deleteTemplate = useMutation(
    (id: string) => api.delete(`/templates/${id}`),
    { onSuccess: () => queryClient.invalidateQueries(['templates']) }
  );

  function resetForm() {
    setEditingId(null);
    setPreviewId(null);
    setName('');
    setSubject('');
    setContent('');
    setError('');
  }

  function openEdit(t: { id: string }) {
    setEditingId(t.id);
    setPreviewId(t.id);
    setError('');
  }

  const previewHtml = (() => {
    if (editingId && previewId === editingId && content.trim()) return getHtmlContent();
    if (previewTemplate?.htmlContent) return previewTemplate.htmlContent;
    if (previewTemplate?.textContent) {
      return previewTemplate.textContent
        .split('\n')
        .map((line: string) => `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
        .join('\n');
    }
    return '';
  })();
  const showPreviewPlaceholder = !previewHtml.trim();

  function getHtmlContent(): string {
    if (isHtml(content)) return content;
    return content
      .split('\n')
      .map((line) => `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
      .join('\n');
  }

  function getTextContent(): string | undefined {
    if (!isHtml(content)) return content;
    return content.replace(/<[^>]+>/g, '\n').replace(/\n+/g, '\n').trim();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const htmlContent = getHtmlContent();
    const textContent = getTextContent();
    if (editingId) {
      updateTemplate.mutate({
        id: editingId,
        payload: { name: name || undefined, subject: subject || undefined, htmlContent, textContent },
      });
    } else {
      createTemplate.mutate({
        name: name || 'Untitled',
        subject: subject || undefined,
        htmlContent,
        textContent: textContent || undefined,
      });
    }
  }

  const contentType = isHtml(content) ? 'HTML' : 'Plain text';

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="tactical-heading text-2xl">Templates</h1>
        <p className="tactical-label mb-6 normal-case text-neutral-500">
          Create and manage custom templates. Content is auto-detected as plain text or HTML for proper formatting.
        </p>

        {/* Tabs: All Templates | Template Viewer */}
        <div className="flex border-b border-white/[0.08] mb-8 gap-0">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`font-heading text-sm font-medium tracking-tight px-5 py-3 border-b-2 transition-colors ${
              activeTab === 'all'
                ? 'border-primary-500 text-primary-400 bg-white/[0.03]'
                : 'border-transparent text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.02]'
            }`}
          >
            All Templates
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('viewer')}
            className={`font-heading text-sm font-medium tracking-tight px-5 py-3 border-b-2 transition-colors ${
              activeTab === 'viewer'
                ? 'border-primary-500 text-primary-400 bg-white/[0.03]'
                : 'border-transparent text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.02]'
            }`}
          >
            Template Viewer
          </button>
        </div>

        {activeTab === 'viewer' && (
          <section className="tactical-card rounded-xl border-t-2 border-t-primary-500/40 overflow-hidden">
            <div className="p-6 md:p-8">
              <div className="mb-6 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="font-heading font-semibold text-lg text-neutral-100 flex items-center gap-2 tracking-tight">
                    <Icon name="devices" size={24} className="text-primary-500" />
                    Template Viewer
                  </h2>
                  <p className="text-sm text-neutral-500 mt-0.5 font-sans">
                    See how your template looks across devices. Switch to All Templates to edit or click Preview.
                  </p>
                </div>
                {previewId && previewTemplate && (
                  <div className="rounded-lg bg-surface-700/80 border border-white/5 px-4 py-2.5">
                    <p className="text-xs text-neutral-500 font-sans uppercase tracking-wider">Showing</p>
                    <p className="font-medium text-neutral-100 font-sans">{previewTemplate.name}</p>
                  </div>
                )}
              </div>

              {/* Device selector */}
              <div className="mb-8 flex flex-wrap gap-2">
                {[
                  { id: 'desktop' as const, label: 'Desktop', icon: 'computer' },
                  { id: 'ipad' as const, label: 'iPad', icon: 'tablet_mac' },
                  { id: 'iphone' as const, label: 'iPhone', icon: 'phone_iphone' },
                ].map(({ id, label, icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setViewerDevice(id)}
                    className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                      viewerDevice === id
                        ? 'bg-primary-500/20 text-primary-400 border border-primary-500/40 shadow-sm'
                        : 'bg-white/[0.04] text-neutral-400 border border-transparent hover:bg-white/[0.06] hover:text-neutral-300'
                    }`}
                  >
                    <Icon name={icon} size={20} />
                    {label}
                  </button>
                ))}
              </div>

              {/* Responsive preview area */}
              <div className="flex justify-center">
                {viewerDevice === 'iphone' && (
                  <IPhone16Mockup htmlContent={previewHtml} isEmpty={showPreviewPlaceholder} />
                )}
                {viewerDevice === 'ipad' && (
                  <IPadMockup htmlContent={previewHtml} isEmpty={showPreviewPlaceholder} />
                )}
                {viewerDevice === 'desktop' && (
                  <DesktopMockup htmlContent={previewHtml} isEmpty={showPreviewPlaceholder} />
                )}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'all' && (
        <div className="grid lg:grid-cols-2 gap-8">
          <div className="tactical-card rounded-lg overflow-hidden">
            <h2 className="font-heading font-semibold text-lg text-neutral-100 p-4 border-b border-white/[0.08] flex items-center gap-2 tracking-tight">
              <Icon name="description" size={22} className="text-primary-500/80" /> All templates
            </h2>
            {isLoading && <div className="p-8 text-center text-neutral-500 font-medium">Loading...</div>}
            {!isLoading && templates.length === 0 && (
              <div className="p-8 text-center text-neutral-500 font-medium">No templates yet.</div>
            )}
            {!isLoading && templates.length > 0 && (
              <ScrollableListRegion ariaLabel="All templates">
                <ul className="divide-y divide-white/[0.06]">
                  {templates.map((t: { id: string; name: string; subject: string | null; updatedAt: string }) => (
                    <li key={t.id} className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors">
                      <div>
                        <p className="font-medium text-neutral-100">{t.name}</p>
                        {t.subject && <p className="text-sm text-neutral-500">{t.subject}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => { setPreviewId(t.id); setError(''); }}
                          className="text-slate-400 hover:text-slate-200 text-sm flex items-center gap-1"
                        >
                          <Icon name="visibility" size={18} /> Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(t)}
                          className="text-primary-400 hover:text-primary-300 text-sm"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTemplate.mutate(t.id)}
                          className="text-red-400 hover:text-red-300 text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </ScrollableListRegion>
            )}
          </div>
          <div className="tactical-card rounded-lg p-6 border-t-2 border-t-primary-500/40">
            <h2 className="font-heading font-semibold text-lg text-neutral-100 mb-4 flex items-center gap-2 tracking-tight">
              <Icon name="edit" size={22} className="text-primary-500/80" /> {editingId ? 'Edit template' : 'New template'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="tactical-label mb-1.5 normal-case text-neutral-400">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="tactical-input px-4 py-2 rounded"
                  required
                />
              </div>
              <div>
                <label className="tactical-label mb-1.5 normal-case text-neutral-400">Subject (optional)</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="tactical-input px-4 py-2 rounded"
                />
              </div>
              <div>
                <label className="tactical-label mb-1.5 normal-case text-neutral-400">
                  Content — detected as: <strong className="text-neutral-300">{contentType}</strong>
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Type plain text or HTML..."
                  rows={12}
                  className="tactical-input px-4 py-3 rounded font-mono text-sm"
                />
              </div>
              {error && <p className="text-red-400 text-sm font-medium">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={createTemplate.isLoading || updateTemplate.isLoading}
                  className="tactical-btn-primary rounded disabled:opacity-50"
                >
                  {editingId ? 'Update' : 'Create'}
                </button>
                {editingId && (
                  <button type="button" onClick={resetForm} className="tactical-btn-ghost rounded">
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
