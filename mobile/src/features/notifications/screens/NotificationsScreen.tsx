import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { BellOff, CheckCheck, Settings, Trash2 } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import type { RouteName } from '@/app/navigation/routes';
import { Screen } from '@/shared/components/ui/Screen';
import { IconButton } from '@/shared/components/ui/IconButton';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { Button } from '@/shared/components/ui/Button';
import { showToast } from '@/shared/stores/toastStore';
import { useNotificationsStore } from '../store/notificationsStore';
import { notificationIcons } from '../constants/notificationIcons';
import { useTheme } from '@/hooks/use-theme';
import type { AppNotification } from '../types/notification';

const groups = ['Today', 'Yesterday', 'Earlier'] as const;

export function NotificationsScreen() {
  const { colors } = useTheme();
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
        <View style={styles.headerRight}>
          <IconButton
            icon={CheckCheck}
            label="Mark all as read"
            onPress={() => {
              markAllRead();
              showToast({ message: 'All caught up' });
            }}
            disabled={unread === 0}
          />
          <IconButton
            icon={Settings}
            label="Notification settings"
            onPress={() => navigate('notificationPreferences')}
          />
        </View>
      }
      contentContainerStyle={styles.container}
    >
      {items.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title="No notifications"
            body="Reminders, achievements and reports will show up here."
            actionLabel="Notification settings"
            onAction={() => navigate('notificationPreferences')}
          />
        ) : (
          groups.map((g) => {
            const list = items.filter((n) => n.group === g);
            if (!list.length) return null;

            return (
              <View key={g} style={styles.groupSection}>
                <Text style={[styles.groupHeading, { color: colors.muted }]}>{g}</Text>
                <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                  {list.map((n, idx) => {
                    const Icon = notificationIcons[n.kind];
                    return (
                      <TouchableOpacity
                        key={n.id}
                        activeOpacity={0.7}
                        onPress={() => openItem(n)}
                        style={[
                          styles.notificationRow,
                          { borderBottomColor: colors.line },
                          idx === list.length - 1 && { borderBottomWidth: 0 },
                        ]}
                      >
                        <View
                          style={[
                            styles.iconBox,
                            {
                              backgroundColor: n.read ? colors.surface2 : colors.accent,
                            },
                          ]}
                        >
                          <Icon size={18} color={n.read ? colors.ink : colors.ink} />
                        </View>

                        <View style={{ flex: 1, gap: 2 }}>
                          <View style={styles.rowTop}>
                            <Text
                              style={[
                                styles.rowTitle,
                                { color: colors.ink, fontWeight: n.read ? '500' : '700' },
                              ]}
                              numberOfLines={1}
                            >
                              {n.title}
                            </Text>
                            <Text style={[styles.rowTime, { color: colors.muted }]}>{n.time}</Text>
                          </View>
                          <Text
                            style={[styles.rowBody, { color: colors.muted }]}
                            numberOfLines={2}
                          >
                            {n.body}
                          </Text>
                        </View>

                        {!n.read && (
                          <View
                            style={[styles.unreadDot, { backgroundColor: colors.accent }]}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })
        )}

      {/* Notification Detail BottomSheet */}
      <BottomSheet
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open?.title}
        description={open ? `${open.group} · ${open.time}` : undefined}
        footer={
          open ? (
            <View style={styles.sheetActions}>
              <Button
                variant="danger"
                icon={Trash2}
                onPress={() => {
                  const n = open;
                  remove(n.id);
                  setOpen(null);
                  showToast({ message: 'Notification removed' });
                }}
              >
                Remove
              </Button>
              {open.actionLabel && open.actionRoute ? (
                <View style={{ flex: 1 }}>
                  <Button
                    fullWidth
                    onPress={() => {
                      const r = open.actionRoute as RouteName;
                      setOpen(null);
                      navigate(r);
                    }}
                  >
                    {open.actionLabel}
                  </Button>
                </View>
              ) : (
                <View style={{ flex: 1 }}>
                  <Button fullWidth variant="secondary" onPress={() => setOpen(null)}>
                    Done
                  </Button>
                </View>
              )}
            </View>
          ) : undefined
        }
      >
        <Text style={[styles.sheetBodyText, { color: colors.ink }]}>{open?.body}</Text>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
    gap: 18,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  groupSection: {
    gap: 8,
  },
  groupHeading: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  notificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
  },
  rowTitle: {
    fontSize: 15,
    flex: 1,
  },
  rowTime: {
    fontSize: 11.5,
    fontVariant: ['tabular-nums'],
  },
  rowBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 10,
  },
  sheetBodyText: {
    fontSize: 15,
    lineHeight: 22,
  },
});

