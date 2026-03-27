import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { api } from '../services/api';
import Icon from '../components/Icon';
import { ScrollableListRegion } from '../components/ScrollableListRegion';

type List = { id: string; name: string; contactCount: number };
type Contact = { id: string; email: string; firstName?: string | null; lastName?: string | null };
type SelectedList = List & { contacts: Contact[] };
type ImportSource = 'paste' | 'file';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function validateEmails(
  candidates: string[],
  existingEmails: Set<string>
): { validEmails: string[]; invalidCount: number; duplicateCount: number } {
  const seen = new Set<string>();
  const validEmails: string[] = [];
  let invalidCount = 0;
  let duplicateCount = 0;

  for (const candidate of candidates) {
    const email = normalizeEmail(candidate);
    if (!email) continue;

    if (!EMAIL_REGEX.test(email)) {
      invalidCount += 1;
      continue;
    }

    if (seen.has(email) || existingEmails.has(email)) {
      duplicateCount += 1;
      continue;
    }

    seen.add(email);
    validEmails.push(email);
  }

  return { validEmails, invalidCount, duplicateCount };
}

async function extractEmailsFromFile(file: File): Promise<string[]> {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.csv')) {
    const text = await file.text();
    return text.split(/[\n,;\s]+/);
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, raw: false });
  const emails: string[] = [];

  for (const row of rows) {
    const values = Array.isArray(row) ? row : Object.values(row ?? {});
    for (const value of values) {
      const text = String(value ?? '').trim();
      if (text) emails.push(text);
    }
  }

  return emails;
}

function buildImportNotice(addedCount: number, invalidCount: number, duplicateCount: number): string {
  const parts = [`Imported ${pluralize(addedCount, 'email')}`];
  if (invalidCount > 0) parts.push(`skipped ${pluralize(invalidCount, 'invalid email', 'invalid emails')}`);
  if (duplicateCount > 0) parts.push(`removed ${pluralize(duplicateCount, 'duplicate')}`);
  return `${parts.join(', ')}.`;
}

function buildNoImportError(invalidCount: number, duplicateCount: number): string {
  const skipped: string[] = [];
  if (invalidCount > 0) skipped.push(pluralize(invalidCount, 'invalid email', 'invalid emails'));
  if (duplicateCount > 0) skipped.push(pluralize(duplicateCount, 'duplicate'));

  if (skipped.length === 0) return 'No new valid email addresses found.';
  return `No new valid email addresses found. Skipped ${skipped.join(' and ')}.`;
}

function parseApiError(err: { response?: { data?: { error?: unknown } } }): string {
  const raw = err.response?.data?.error;
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'formErrors' in raw) {
    const r = raw as { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
    return r.formErrors?.[0] ?? Object.values(r.fieldErrors ?? {}).flat()[0] ?? 'Request failed';
  }
  if (raw && typeof raw === 'object') {
    const first = (Object.values(raw as Record<string, unknown>).flat().flat().filter(Boolean)[0] as string);
    return first ?? 'Request failed';
  }
  return 'Request failed';
}

export default function LeadsPage() {
  const queryClient = useQueryClient();
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [importError, setImportError] = useState('');
  const [importNotice, setImportNotice] = useState('');
  const [newListName, setNewListName] = useState('');
  const [createListError, setCreateListError] = useState('');
  const [importFileError, setImportFileError] = useState('');
  const [importFileNotice, setImportFileNotice] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [renameModal, setRenameModal] = useState<List | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteListConfirm, setDeleteListConfirm] = useState<List | null>(null);
  const [deleteListError, setDeleteListError] = useState('');
  const [listNotice, setListNotice] = useState('');
  const [deleteContactConfirm, setDeleteContactConfirm] = useState<{ listId: string; contact: Contact } | null>(null);

  const { data: lists = [], isLoading: listsLoading, error: listsError } = useQuery(
    ['lists'],
    () => api.get('/lists').then((r) => r.data),
    { retry: 1 }
  );
  const { data: selectedList, isLoading: listLoading, error: listError } = useQuery<SelectedList>(
    ['list', selectedListId],
    () => api.get(`/lists/${selectedListId}`).then((r) => r.data),
    { enabled: !!selectedListId, retry: false }
  );

  const createList = useMutation(
    (name: string) => api.post('/lists', { name }).then((r) => r.data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['lists']);
        setCreateListError('');
        setNewListName('');
      },
      onError: (err) => {
        setCreateListError(parseApiError(err as Parameters<typeof parseApiError>[0]));
      },
    }
  );
  const updateList = useMutation(
    ({ id, name }: { id: string; name: string }) => api.patch(`/lists/${id}`, { name }),
    {
      onSuccess: (_, { id }) => {
        queryClient.invalidateQueries(['lists']);
        queryClient.invalidateQueries(['list', id]);
        setRenameModal(null);
      },
      onError: (err) => {
        setRenameValue(renameModal?.name ?? '');
        setCreateListError(parseApiError(err as Parameters<typeof parseApiError>[0]));
      },
    }
  );
  const deleteList = useMutation(
    (id: string) => api.delete(`/lists/${id}`),
    {
      onSuccess: (_, deletedId) => {
        queryClient.invalidateQueries(['lists']);
        queryClient.invalidateQueries(['campaigns']);
        setDeleteListError('');
        setListNotice('List deleted.');
        if (selectedListId === deletedId) setSelectedListId(null);
        setDeleteListConfirm(null);
      },
      onError: (err) => {
        setDeleteListError(parseApiError(err as Parameters<typeof parseApiError>[0]));
      },
    }
  );
  const importEmails = useMutation(
    ({
      listId,
      emails,
    }: {
      listId: string;
      emails: string[];
      source: ImportSource;
      invalidCount: number;
      duplicateCount: number;
    }) => api.post(`/lists/${listId}/import`, { emails }),
    {
      onSuccess: (response, { listId, emails, source, invalidCount, duplicateCount }) => {
        queryClient.invalidateQueries(['lists']);
        queryClient.invalidateQueries(['list', listId]);
        const addedCount =
          typeof (response as { data?: { added?: unknown } })?.data?.added === 'number'
            ? (response as { data: { added: number } }).data.added
            : emails.length;
        const serverSkipped = Math.max(0, emails.length - addedCount);
        const totalDuplicateCount = duplicateCount + serverSkipped;
        const notice = buildImportNotice(addedCount, invalidCount, totalDuplicateCount);

        if (source === 'paste') {
          setPasteText('');
          setImportError('');
          setImportNotice(notice);
        } else {
          setImportFileError('');
          setImportFileNotice(notice);
        }
      },
      onError: (err) => {
        setImportError(parseApiError(err as Parameters<typeof parseApiError>[0]));
      },
    }
  );
  const deleteContact = useMutation(
    ({ listId, contactId }: { listId: string; contactId: string }) =>
      api.delete(`/lists/${listId}/contacts/${contactId}`),
    {
      onSuccess: (_, { listId }) => {
        queryClient.invalidateQueries(['lists']);
        queryClient.invalidateQueries(['list', listId]);
        setDeleteContactConfirm(null);
      },
      onError: (err) => {
        setImportError(parseApiError(err as Parameters<typeof parseApiError>[0]));
      },
    }
  );

  const handlePasteImport = () => {
    if (!selectedListId) {
      setImportError('Select a list first');
      return;
    }
    setImportError('');
    setImportNotice('');
    const { validEmails, invalidCount, duplicateCount } = validateEmails(
      pasteText.split(/[\n,;\s]+/),
      existingEmails
    );
    if (validEmails.length === 0) {
      setImportError(buildNoImportError(invalidCount, duplicateCount));
      return;
    }
    importEmails.mutate({
      listId: selectedListId,
      emails: validEmails,
      source: 'paste',
      invalidCount,
      duplicateCount,
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!selectedListId) {
      setImportFileError('Select a list first');
      e.target.value = '';
      return;
    }
    setImportFileError('');
    setImportFileNotice('');

    try {
      const extractedEmails = await extractEmailsFromFile(file);
      const { validEmails, invalidCount, duplicateCount } = validateEmails(extractedEmails, existingEmails);

      if (validEmails.length === 0) {
        setImportFileError(buildNoImportError(invalidCount, duplicateCount));
        e.target.value = '';
        return;
      }

      importEmails.mutate({
        listId: selectedListId,
        emails: validEmails,
        source: 'file',
        invalidCount,
        duplicateCount,
      });
    } catch {
      setImportFileError('Failed to read file. Use Excel (.xlsx, .xls) or CSV with email values.');
    }

    e.target.value = '';
  };

  const openRename = (l: List) => {
    setRenameModal(l);
    setRenameValue(l.name);
    setCreateListError('');
  };

  useEffect(() => {
    if (listError && selectedListId) {
      queryClient.invalidateQueries(['lists']);
      setSelectedListId(null);
    }
  }, [listError, selectedListId, queryClient]);

  useEffect(() => {
    setImportError('');
    setImportNotice('');
    setImportFileError('');
    setImportFileNotice('');
  }, [selectedListId]);

  useEffect(() => {
    if (!listNotice) return undefined;
    const t = window.setTimeout(() => setListNotice(''), 5000);
    return () => clearTimeout(t);
  }, [listNotice]);

  const filteredContacts = useMemo(() => {
    const contacts = selectedList?.contacts ?? [];
    if (!contactSearch.trim()) return contacts;
    const q = contactSearch.trim().toLowerCase();
    return contacts.filter((c: Contact) => c.email.toLowerCase().includes(q));
  }, [selectedList?.contacts, contactSearch]);

  const displayContacts = filteredContacts.slice(0, 100);
  const totalContacts = selectedList?.contacts?.length ?? 0;
  const existingEmails = useMemo(
    () => new Set((selectedList?.contacts ?? []).map((c: Contact) => normalizeEmail(c.email))),
    [selectedList?.contacts]
  );
  const importLoading = importEmails.isLoading;

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="tactical-heading text-2xl">Leads</h1>
        <p className="tactical-label mb-4 normal-case text-neutral-500">
          Manage your email lists: create lists, paste or upload emails (.xlsx, .xls, .csv), and remove contacts.
        </p>
        {listNotice ? (
          <p className="mb-6 text-primary-400 text-sm font-medium rounded-lg bg-primary-500/10 border border-primary-500/20 px-4 py-3">
            {listNotice}
          </p>
        ) : null}
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <div className="bg-surface-800/50 border border-white/[0.08] rounded-xl p-6">
              <h2 className="text-lg font-semibold text-neutral-200 mb-4 flex items-center gap-2">
                <Icon name="folder" size={22} /> Your lists
              </h2>
              {listsLoading && <p className="text-neutral-500">Loading...</p>}
              {listsError != null && !listsLoading ? (
                <p className="text-amber-400 text-sm mb-4">Unable to load lists. Check your connection or license.</p>
              ) : null}
              {!listsLoading && !listsError && lists.length === 0 && (
                <p className="text-neutral-500 text-sm mb-4">No lists yet. Create one below.</p>
              )}
              {!listsLoading && lists.length > 0 && (
                <ScrollableListRegion ariaLabel="Your email lists" maxHeightClass="max-h-[min(55vh,420px)]" className="mb-4 pr-1 -mr-1">
                  <ul className="space-y-2">
                    {(lists as List[]).map((l) => (
                      <li key={l.id} className="flex items-center gap-1 group">
                        <button
                          type="button"
                          onClick={() => setSelectedListId(l.id)}
                          className={`flex-1 text-left px-4 py-2 rounded-lg text-sm transition-colors ${
                            selectedListId === l.id ? 'bg-primary-600/20 text-primary-400' : 'text-neutral-300 hover:bg-surface-800/50'
                          }`}
                        >
                          {l.name} <span className="text-neutral-500">({l.contactCount})</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openRename(l); }}
                          className="p-1.5 text-neutral-500 hover:text-neutral-300 hover:bg-surface-800 rounded opacity-0 group-hover:opacity-100"
                          title="Rename list"
                        >
                          <Icon name="edit" size={18} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteListConfirm(l);
                            setDeleteListError('');
                            setCreateListError('');
                          }}
                          className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-surface-800 rounded opacity-0 group-hover:opacity-100"
                          title="Delete list"
                        >
                          <Icon name="delete" size={18} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </ScrollableListRegion>
              )}
              <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-1.5">
                  <label className="tactical-label normal-case text-neutral-400 sr-only">New list name</label>
                  <input
                    type="text"
                    placeholder="New list name"
                    value={newListName}
                    onChange={(e) => { setNewListName(e.target.value); setCreateListError(''); }}
                    className="tactical-input"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (newListName.trim()) createList.mutate(newListName.trim());
                  }}
                  disabled={createList.isLoading || !newListName.trim()}
                  className="tactical-btn-primary rounded text-sm disabled:opacity-50 shrink-0"
                >
                  {createList.isLoading ? 'Adding…' : 'Add'}
                </button>
              </div>
              {createListError && <p className="text-red-400 text-sm mt-2">{createListError}</p>}
            </div>
          </div>
          <div className="lg:col-span-2 space-y-6">
            {selectedListId ? (
              <>
                <div className="bg-surface-800/50 border border-white/[0.08] rounded-xl p-6">
                  <h2 className="text-lg font-semibold text-neutral-200 mb-4 flex items-center gap-2">
                    <Icon name="mail" size={22} /> Paste email addresses
                  </h2>
                  <p className="text-neutral-500 text-sm mb-3">One per line, or comma/semicolon separated.</p>
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder={'email1@example.com\nemail2@example.com'}
                    rows={6}
                    className="w-full px-4 py-3 rounded-lg bg-surface-800 border border-white/10 text-neutral-100 placeholder-neutral-500 font-mono text-sm"
                  />
                  {importError && <p className="text-red-400 text-sm mt-2">{importError}</p>}
                  {importNotice && <p className="text-primary-400 text-sm mt-2 font-medium">{importNotice}</p>}
                  <button
                    type="button"
                    onClick={handlePasteImport}
                    disabled={importLoading || !pasteText.trim()}
                    className="mt-4 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {importLoading ? 'Importing…' : 'Import to list'}
                  </button>
                </div>
                <div className="bg-surface-800/50 border border-white/[0.08] rounded-xl p-6">
                  <h2 className="font-heading text-lg font-semibold text-neutral-100 mb-1 flex items-center gap-2 tracking-tight">
                    <Icon name="upload_file" size={20} className="text-primary-500/80" /> Upload file
                  </h2>
                  <p className="text-neutral-500 text-sm mb-3 font-sans">.xlsx, .xls, or .csv. Emails are read from the first sheet or column.</p>
                  <label className="inline-flex items-center gap-2 px-4 py-2 bg-surface-700 hover:bg-surface-600 border border-white/10 rounded cursor-pointer text-sm font-sans text-neutral-200 transition-colors">
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <Icon name="upload_file" size={20} />
                    {importLoading ? 'Validating…' : 'Choose file'}
                  </label>
                  {importFileError && <p className="text-red-400 text-sm mt-2">{importFileError}</p>}
                  {importFileNotice && <p className="text-primary-400 text-sm mt-2 font-medium">{importFileNotice}</p>}
                </div>
                <div className="bg-surface-800/50 border border-white/[0.08] rounded-xl overflow-hidden">
                  <div className="p-4 border-b border-white/[0.08] flex flex-wrap items-center gap-3">
                    <h2 className="font-heading text-lg font-semibold text-neutral-100 tracking-tight">Contacts ({totalContacts})</h2>
                    {totalContacts > 0 && (
                      <div className="flex-1 min-w-[12rem] max-w-xs">
                        <label className="sr-only">Search by email</label>
                        <input
                          type="text"
                          placeholder="Search by email…"
                          value={contactSearch}
                          onChange={(e) => setContactSearch(e.target.value)}
                          className="tactical-input w-full"
                        />
                      </div>
                    )}
                  </div>
                  {listLoading && <div className="p-8 text-center text-neutral-500">Loading...</div>}
                  {!listLoading && totalContacts === 0 && (
                    <div className="p-8 text-center text-neutral-500">No contacts yet. Paste or upload emails above.</div>
                  )}
                  {!listLoading && totalContacts > 0 && filteredContacts.length === 0 && (
                    <div className="p-8 text-center text-neutral-500">No contacts match your search.</div>
                  )}
                  {!listLoading && displayContacts.length > 0 && (
                    <ScrollableListRegion ariaLabel="Contacts in selected list" className="pr-1 -mr-1">
                      <ul>
                        {displayContacts.map((c: Contact) => (
                          <li
                            key={c.id}
                            className="px-6 py-2 border-b border-white/[0.06] flex items-center justify-between gap-2 group text-neutral-300 text-sm"
                          >
                            <span>{c.email}</span>
                            <button
                              type="button"
                              onClick={() => setDeleteContactConfirm({ listId: selectedListId!, contact: c })}
                              className="p-1.5 text-neutral-500 hover:text-red-400 rounded opacity-0 group-hover:opacity-100"
                              title="Remove contact"
                            >
                              <Icon name="delete" size={16} />
                            </button>
                          </li>
                        ))}
                        {filteredContacts.length > 100 && (
                          <li className="px-6 py-2 text-neutral-500 text-sm">
                            … and {filteredContacts.length - 100} more
                          </li>
                        )}
                      </ul>
                    </ScrollableListRegion>
                  )}
                </div>
              </>
            ) : (
              <div className="bg-surface-800/50 border border-white/[0.08] rounded-xl p-12 text-center text-neutral-500">
                Select a list to add or view contacts.
              </div>
            )}
          </div>
        </div>
      </div>

      {renameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setRenameModal(null)}>
          <div className="tactical-card rounded-lg w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-heading text-lg font-semibold text-neutral-100 mb-4 tracking-tight">Rename list</h3>
            <div className="space-y-1.5 mb-4">
              <label className="tactical-label normal-case text-neutral-400">List name</label>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="tactical-input"
                placeholder="List name"
              />
            </div>
            {createListError && <p className="text-red-400 text-sm mb-2 font-medium">{createListError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setRenameModal(null)} className="tactical-btn-ghost rounded text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => renameValue.trim() && updateList.mutate({ id: renameModal.id, name: renameValue.trim() })}
                disabled={updateList.isLoading || !renameValue.trim()}
                className="tactical-btn-primary rounded text-sm disabled:opacity-50"
              >
                {updateList.isLoading ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteListConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => {
            setDeleteListConfirm(null);
            setDeleteListError('');
          }}
        >
          <div className="tactical-card rounded-lg w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-heading text-lg font-semibold text-neutral-100 mb-2 tracking-tight">Delete list?</h3>
            <p className="text-neutral-400 text-sm mb-3 font-sans">
              “{deleteListConfirm.name}” and all its contacts will be removed. Any campaigns that used this list are
              removed as well, including their analytics for those sends. This cannot be undone.
            </p>
            {deleteListError ? <p className="text-red-400 text-sm mb-3 font-medium">{deleteListError}</p> : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteListConfirm(null);
                  setDeleteListError('');
                }}
                className="tactical-btn-ghost rounded text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteList.mutate(deleteListConfirm.id)}
                disabled={deleteList.isLoading}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {deleteList.isLoading ? 'Deleting…' : 'Delete list'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteContactConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => { setDeleteContactConfirm(null); setImportError(''); }}>
          <div className="tactical-card rounded-lg w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-heading text-lg font-semibold text-neutral-100 mb-2 tracking-tight">Remove contact?</h3>
            <p className="text-neutral-400 text-sm mb-4 font-sans break-all">{deleteContactConfirm.contact.email}</p>
            {importError && <p className="text-red-400 text-sm mb-2 font-medium">{importError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setDeleteContactConfirm(null)} className="tactical-btn-ghost rounded text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteContact.mutate({ listId: deleteContactConfirm.listId, contactId: deleteContactConfirm.contact.id })}
                disabled={deleteContact.isLoading}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {deleteContact.isLoading ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
