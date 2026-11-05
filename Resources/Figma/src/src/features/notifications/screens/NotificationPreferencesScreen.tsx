import React, { useState } from 'react';
import { Screen } from '../../../shared/components/ui/Screen';
import { Toggle } from '../../../shared/components/ui/Toggle';
import { BottomSheet } from '../../../shared/components/ui/BottomSheet';
import { Chip } from '../../../shared/components/ui/Chip';
import { Button } from '../../../shared/components/ui/Button';
import { showToast } from '../../../shared/stores/toastStore';
import { useNotificationsStore } from '../store/notificationsStore';
import { notificationIcons } from '../constants/notificationIcons';
import type { NotificationKind } from '../types/notification';

const times = ['6:30 AM', '7:00 AM', '8:00 AM', '6:00 PM', '8:00 PM', '9:30 PM', '10:30 PM'];

export function NotificationPreferencesScreen() {
  const { preferences, togglePreference, setPreferenceTime } = useNotificationsStore();
  const [quiet, setQuiet] = useState(true);
  const [editing, setEditing] = useState<NotificationKind | null>(null);
  const current = preferences.find((p) => p.key === editing);

  return (
    <Screen title="Notification settings">
      <ul className="mx-4 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
        {preferences.map((p) => {
          const Icon = notificationIcons[p.key];
          return (
            <li key={p.key} className="flex items-center gap-3 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface2"><Icon size={17} className="text-ink" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-ink">{p.label}</span>
                <span className="block text-[12.5px] text-muted">{p.description}</span>
                {p.time && p.enabled &&
                <button type="button" onClick={() => setEditing(p.key)} className="mt-1 font-mono text-[12.5px] font-semibold text-ink underline underline-offset-2">{p.time}</button>
                }
              </span>
              <Toggle checked={p.enabled} onChange={() => togglePreference(p.key)} label={p.label} />
            </li>);

        })}
      </ul>

      <div className="mx-4 mt-4 flex items-center gap-3 rounded-3xl border border-line bg-surface px-4 py-3.5">
        <span className="flex-1">
          <span className="block text-[15px] font-medium text-ink">Quiet hours</span>
          <span className="block text-[12.5px] text-muted">No reminders 11:00 PM – 6:00 AM</span>
        </span>
        <Toggle checked={quiet} onChange={setQuiet} label="Quiet hours" />
      </div>
      <p className="mx-6 mt-3 text-[12px] text-muted">Reminders adapt to your data — e.g. no walk nudge if you’ve already hit your steps.</p>

      <BottomSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={current ? `${current.label} time` : undefined}
        footer={<Button fullWidth size="lg" onClick={() => {setEditing(null);showToast({ message: 'Reminder time saved' });}}>Done</Button>}>
        
        <div className="flex flex-wrap gap-2">
          {times.map((t) =>
          <Chip key={t} selected={current?.time === t} onClick={() => editing && setPreferenceTime(editing, t)}>{t}</Chip>
          )}
        </div>
      </BottomSheet>
    </Screen>);

}