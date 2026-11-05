import React, { useState } from 'react';
import { BellOffIcon, CheckCheckIcon, SettingsIcon, Trash2Icon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import type { RouteName } from '../../../app/navigation/routes';
import { Screen } from '../../../shared/components/ui/Screen';
import { IconButton } from '../../../shared/components/ui/IconButton';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { BottomSheet } from '../../../shared/components/ui/BottomSheet';
import { Button } from '../../../shared/components/ui/Button';
import { showToast } from '../../../shared/stores/toastStore';
import { cn } from '../../../shared/utils/cn';
import { useNotificationsStore } from '../store/notificationsStore';
import { notificationIcons } from '../constants/notificationIcons';
import type { AppNotification } from '../types/notification';

const groups = ['Today', 'Yesterday', 'Earlier'] as const;

export function NotificationsScreen() {
  const { navigate } = useNavigation();
  const { items, markRead, markAllRead, remove } = useNotificationsStore();
  const [open, setOpen] = useState<AppNotification | null>(null);
  const unread = items.filter((n) => !n.read).length;

  const openItem = (n: AppNotification) => {
    markRead(n.id);
    setOpen(n);
  };

  return (
    <Screen
      title="Notifications"
      headerRight={
      <>
          <IconButton icon={CheckCheckIcon} label="Mark all as read" onClick={() => {markAllRead();showToast({ message: 'All caught up' });}} disabled={unread === 0} />
          <IconButton icon={SettingsIcon} label="Notification settings" onClick={() => navigate('notificationPreferences')} />
        </>
      }>
      
      {items.length === 0 ?
      <EmptyState icon={BellOffIcon} title="No notifications" body="Reminders, achievements and reports will show up here." actionLabel="Notification settings" onAction={() => navigate('notificationPreferences')} /> :

      groups.map((g) => {
        const list = items.filter((n) => n.group === g);
        if (!list.length) return null;
        return (
          <section key={g} className="mb-5 px-4" aria-label={g}>
              <h2 className="mb-2 px-1 text-[12px] font-medium text-muted">{g}</h2>
              <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
                {list.map((n) => {
                const Icon = notificationIcons[n.kind];
                return (
                  <li key={n.id}>
                      <button type="button" onClick={() => openItem(n)} className="flex w-full gap-3 px-4 py-3.5 text-left hover:bg-surface2/60">
                        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', n.read ? 'bg-surface2 text-ink' : 'bg-accent text-accentInk')}>
                          <Icon size={18} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className={cn('truncate text-[15px] text-ink', n.read ? 'font-medium' : 'font-semibold')}>{n.title}</span>
                            <span className="shrink-0 text-[11.5px] text-muted">{n.time}</span>
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-muted">{n.body}</span>
                        </span>
                        {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-move" aria-label="Unread" />}
                      </button>
                    </li>);

              })}
              </ul>
            </section>);

      })
      }

      <BottomSheet
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open?.title}
        description={open ? `${open.group} · ${open.time}` : undefined}
        footer={
        open &&
        <div className="flex gap-2">
              <Button variant="danger" icon={Trash2Icon} onClick={() => {const n = open;remove(n.id);setOpen(null);showToast({ message: 'Notification removed' });}}>Remove</Button>
              {open.actionLabel && open.actionRoute ?
          <Button fullWidth onClick={() => {const r = open.actionRoute as RouteName;setOpen(null);navigate(r);}}>{open.actionLabel}</Button> :

          <Button fullWidth variant="secondary" onClick={() => setOpen(null)}>Done</Button>
          }
            </div>

        }>
        
        <p className="text-[15px] leading-relaxed text-ink">{open?.body}</p>
      </BottomSheet>
    </Screen>);

}