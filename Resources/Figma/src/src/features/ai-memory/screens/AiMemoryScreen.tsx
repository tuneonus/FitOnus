import React, { useState } from 'react';
import { BrainIcon, LockIcon, PencilIcon, ShieldCheckIcon, Trash2Icon } from 'lucide-react';
import { Screen } from '../../../shared/components/ui/Screen';
import { Toggle } from '../../../shared/components/ui/Toggle';
import { Button } from '../../../shared/components/ui/Button';
import { Badge } from '../../../shared/components/ui/Badge';
import { BottomSheet } from '../../../shared/components/ui/BottomSheet';
import { ConfirmDialog } from '../../../shared/components/ui/ConfirmDialog';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { showToast } from '../../../shared/stores/toastStore';
import { MemoryItem, useMemoryStore } from '../store/memoryStore';
import { memoryCategories, memoryCategoryOrder } from '../constants/memoryCategories';

export function AiMemoryScreen() {
  const { enabled, useSensitive, items, suggestions, setEnabled, setUseSensitive, updateItem, deleteItem, restoreItem, clearAll, approveSuggestion, dismissSuggestion } = useMemoryStore();
  const [editing, setEditing] = useState<MemoryItem | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const startEdit = (m: MemoryItem) => {
    setEditing(m);
    setDraft(m.text);
  };

  const remove = (m: MemoryItem) => {
    deleteItem(m.id);
    setEditing(null);
    showToast({ message: 'Memory deleted', actionLabel: 'Undo', onAction: () => restoreItem(m) });
  };

  return (
    <Screen title="AI memory">
      <section className="mx-4 rounded-[28px] bg-hero p-5 text-heroInk">
        <div className="flex items-start gap-3">
          <BrainIcon size={22} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-[16px] font-semibold">Coach memory</p>
            <p className="mt-1 text-[13px] leading-snug text-heroMuted">What your coach remembers between conversations. Only things you’ve approved are saved. You can edit or delete anything.</p>
          </div>
          <Toggle checked={enabled} onChange={setEnabled} label="Use AI memory" />
        </div>
        <p className="mt-4 border-t border-heroInk/10 pt-3 font-mono text-[12px] text-heroMuted">{items.length} memories · stored encrypted · never used for ads</p>
      </section>

      {!enabled &&
      <p className="mx-6 mt-3 text-[13px] text-muted">Memory is paused. Your coach won’t read or save memories, so answers will be less personal. Saved items stay until you delete them.</p>
      }

      {suggestions.length > 0 && enabled &&
      <section className="mt-6 px-4" aria-labelledby="pending">
          <h2 id="pending" className="mb-2 px-1 text-[17px] font-semibold text-ink">Waiting for your OK</h2>
          <ul className="space-y-2">
            {suggestions.map((s) =>
          <li key={s.id} className="rounded-3xl border border-dashed border-line bg-surface p-4">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-medium text-muted">{memoryCategories[s.category].label}</span>
                  {s.sensitive && <Badge tone="warn"><LockIcon size={11} aria-hidden="true" /> Sensitive</Badge>}
                </div>
                <p className="mt-1.5 text-[15px] leading-snug text-ink">{s.text}</p>
                <p className="mt-1 text-[12px] text-muted">From {s.from}</p>
                {s.sensitive && <p className="mt-2 text-[12.5px] leading-snug text-muted">Health information. Saving it lets the coach factor it into advice — it won’t diagnose or treat anything.</p>}
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => {dismissSuggestion(s.id);showToast({ message: 'Not saved' });}}>Don’t save</Button>
                  <Button size="sm" onClick={() => {approveSuggestion(s.id);showToast({ message: 'Saved to memory' });}}>Save</Button>
                </div>
              </li>
          )}
          </ul>
        </section>
      }

      {items.length === 0 ?
      <EmptyState icon={BrainIcon} title="No memories yet" body="Tell your coach about goals, food preferences or injuries. It will ask before saving anything." /> :

      memoryCategoryOrder.map((cat) => {
        const list = items.filter((i) => i.category === cat);
        if (!list.length) return null;
        const meta = memoryCategories[cat];
        const Icon = meta.icon;
        return (
          <section key={cat} className="mt-6 px-4" aria-label={meta.label}>
              <h2 className="mb-2 flex items-center gap-2 px-1 text-[13px] font-medium text-muted"><Icon size={14} aria-hidden="true" />{meta.label}</h2>
              <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
                {list.map((m) =>
              <li key={m.id}>
                    <button type="button" onClick={() => startEdit(m)} className="flex w-full gap-3 px-4 py-3.5 text-left hover:bg-surface2/60">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14.5px] leading-snug text-ink">{m.text}</span>
                        <span className="mt-1 flex items-center gap-2 text-[12px] text-muted">
                          {m.source} {m.sensitive && <Badge tone="warn" className="h-5"><LockIcon size={10} aria-hidden="true" /> Sensitive</Badge>}
                        </span>
                      </span>
                      <PencilIcon size={15} className="mt-1 shrink-0 text-muted" aria-hidden="true" />
                    </button>
                  </li>
              )}
              </ul>
            </section>);

      })
      }

      <section className="mt-6 px-4" aria-label="Privacy controls">
        <div className="flex items-center gap-3 rounded-3xl border border-line bg-surface px-4 py-3.5">
          <ShieldCheckIcon size={18} className="shrink-0 text-ink" aria-hidden="true" />
          <span className="flex-1">
            <span className="block text-[15px] font-medium text-ink">Use sensitive memories</span>
            <span className="block text-[12.5px] text-muted">Injuries and medical context in recommendations</span>
          </span>
          <Toggle checked={useSensitive} onChange={setUseSensitive} label="Use sensitive memories" />
        </div>
        {items.length > 0 && <Button fullWidth variant="danger" icon={Trash2Icon} className="mt-3" onClick={() => setConfirmClear(true)}>Delete all memories</Button>}
      </section>

      <BottomSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit memory"
        description={editing ? `${memoryCategories[editing.category].label} · saved ${editing.savedOn}` : undefined}
        footer={
        editing &&
        <div className="flex gap-2">
              <Button variant="danger" icon={Trash2Icon} onClick={() => remove(editing)}>Delete</Button>
              <Button fullWidth disabled={!draft.trim()} onClick={() => {updateItem(editing.id, draft.trim());setEditing(null);showToast({ message: 'Memory updated' });}}>Save</Button>
            </div>

        }>
        
        <label htmlFor="memory-text" className="sr-only">Memory text</label>
        <textarea id="memory-text" value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} className="w-full resize-none rounded-2xl border border-line bg-surface2 p-3.5 text-[15px] leading-relaxed text-ink focus:border-ink focus:outline-none" />
        <p className="mt-2 text-[12px] text-muted">Source: {editing?.source}</p>
      </BottomSheet>

      <ConfirmDialog
        open={confirmClear}
        title="Delete all memories?"
        message="Your coach will forget your preferences, injuries and history. Workout and nutrition logs are not affected. This can’t be undone."
        confirmLabel="Delete all"
        destructive
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {clearAll();setConfirmClear(false);showToast({ message: 'All memories deleted' });}} />
      
    </Screen>);

}