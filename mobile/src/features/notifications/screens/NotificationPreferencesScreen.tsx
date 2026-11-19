import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Bell, BellOff } from 'lucide-react-native';
import { Screen } from '@/shared/components/ui/Screen';
import { Toggle } from '@/shared/components/ui/Toggle';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { Chip } from '@/shared/components/ui/Chip';
import { Button } from '@/shared/components/ui/Button';
import { showToast } from '@/shared/stores/toastStore';
import { useNotificationsStore } from '../store/notificationsStore';
import { notificationIcons } from '../constants/notificationIcons';
import { useTheme } from '@/hooks/use-theme';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { useUpdateSettings } from '@/features/profile/hooks/use-settings';
import { notificationService } from '@/services/notificationService';
import { useNotifications } from '../hooks/useNotifications';
import { DevFcmTokenButton } from '../components/DevFcmTokenButton';
import { useServerCategoryPreferences } from '../hooks/useServerCategoryPreferences';
import { CATEGORY_COPY } from '../services/notification-category-preferences';
import { SERVER_CATEGORIES } from '../services/notification-inbox-api';
import { getPermissionCardModel } from '../services/notification-permission-card';
import {
  DEFAULT_NOTIFICATION_SCHEDULE,
  timeTo12h,
  timeTo24h,
  type NotificationKind,
  type NotificationSchedule,
} from '../types/notification';

const workoutTimes = [
  '6:00 AM',
  '6:30 AM',
  '7:00 AM',
  '7:30 AM',
  '8:00 AM',
  '5:30 PM',
  '6:00 PM',
  '6:30 PM',
  '7:00 PM',
  '8:00 PM',
];

const waterIntervalOptions = [
  { label: 'Every 1 hour', value: 1 },
  { label: 'Every 2 hours', value: 2 },
  { label: 'Every 3 hours', value: 3 },
  { label: 'Every 4 hours', value: 4 },
];

const quietHourWindows = [
  { label: '10:00 PM – 6:00 AM', start: '22:00', end: '06:00' },
  { label: '11:00 PM – 6:00 AM', start: '23:00', end: '06:00' },
  { label: '11:00 PM – 7:00 AM', start: '23:00', end: '07:00' },
  { label: '12:00 AM – 6:00 AM', start: '00:00', end: '06:00' },
];

export function NotificationPreferencesScreen() {
  const { colors } = useTheme();
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const notificationSchedule = useSettingsStore((s) => s.notificationSchedule);
  const setNotificationsEnabled = useSettingsStore((s) => s.setNotificationsEnabled);
  const setNotificationSchedule = useSettingsStore((s) => s.setNotificationSchedule);
  const updateSettingsMutation = useUpdateSettings();

  const { permission, enable, openSystemSettings } = useNotifications();
  const permissionCard = getPermissionCardModel(permission);
  const [enablingPermission, setEnablingPermission] = useState(false);

  const { preferences, setPreferenceTime } = useNotificationsStore();
  const serverPrefs = useServerCategoryPreferences();

  const [editingSheet, setEditingSheet] = useState<'workout' | 'water' | 'quiet' | NotificationKind | null>(null);

  // Merged typed schedule
  const schedule = useMemo<NotificationSchedule>(() => {
    const raw = (notificationSchedule || {}) as Partial<NotificationSchedule>;
    return {
      water: {
        ...DEFAULT_NOTIFICATION_SCHEDULE.water,
        ...(raw.water || {}),
      },
      workout: {
        ...DEFAULT_NOTIFICATION_SCHEDULE.workout,
        ...(raw.workout || {}),
      },
      quietHours: {
        ...DEFAULT_NOTIFICATION_SCHEDULE.quietHours,
        ...(raw.quietHours || {}),
      },
      walking: { enabled: true, ...(raw.walking || {}) },
      protein: { enabled: true, time: '20:00', ...(raw.protein || {}) },
      sleep: { enabled: true, time: '22:30', ...(raw.sleep || {}) },
      achievement: { enabled: true, ...(raw.achievement || {}) },
      streak: { enabled: false, ...(raw.streak || {}) },
      report: { enabled: true, ...(raw.report || {}) },
    };
  }, [notificationSchedule]);

  const workoutTime12h = timeTo12h(schedule.workout.time || '07:00');
  const quietHoursEnabled = schedule.quietHours.enabled;
  const quietHoursStart12h = timeTo12h(schedule.quietHours.startTime || '23:00');
  const quietHoursEnd12h = timeTo12h(schedule.quietHours.endTime || '06:00');
  const quietHoursLabel = `${quietHoursStart12h} – ${quietHoursEnd12h}`;

  const handleMasterToggle = async (enabled: boolean) => {
    if (enabled) {
      const perm = await notificationService.checkNotificationPermission();
      if (!perm.granted) {
        const req = await notificationService.requestNotificationPermission();
        if (!req.granted) {
          showToast({ message: 'Notification permission disabled in system settings' });
        }
      }
    }
    setNotificationsEnabled(enabled);
    updateSettingsMutation.mutate({ notificationsEnabled: enabled });
    showToast({ message: enabled ? 'Reminders enabled' : 'Reminders disabled' });
  };

  const handleCategoryToggle = async (key: NotificationKind) => {
    const currentCategory = (schedule[key] && typeof schedule[key] === 'object'
      ? schedule[key]
      : {}) as { enabled?: boolean };
    const nextEnabled = !currentCategory.enabled;

    if (nextEnabled && !notificationsEnabled) {
      showToast({ message: 'Enable master switch above first' });
      return;
    }

    if (nextEnabled) {
      const perm = await notificationService.checkNotificationPermission();
      if (!perm.granted) {
        await notificationService.requestNotificationPermission();
      }
    }

    const nextSchedule: NotificationSchedule = {
      ...schedule,
      [key]: {
        ...currentCategory,
        enabled: nextEnabled,
      },
    };

    setNotificationSchedule(nextSchedule as unknown as Record<string, unknown>);
    updateSettingsMutation.mutate({
      notificationSchedule: nextSchedule as unknown as Record<string, unknown>,
    });
  };

  const handleWorkoutTimeSelect = (t12: string) => {
    const time24 = timeTo24h(t12);
    const nextSchedule: NotificationSchedule = {
      ...schedule,
      workout: {
        ...schedule.workout,
        time: time24,
      },
    };
    setNotificationSchedule(nextSchedule as unknown as Record<string, unknown>);
    updateSettingsMutation.mutate({
      notificationSchedule: nextSchedule as unknown as Record<string, unknown>,
    });
    setPreferenceTime('workout', t12);
    setEditingSheet(null);
    showToast({ message: `Workout reminder set for ${t12}` });
  };

  const handleWaterIntervalSelect = (intervalHours: number) => {
    const nextSchedule: NotificationSchedule = {
      ...schedule,
      water: {
        ...schedule.water,
        intervalHours,
      },
    };
    setNotificationSchedule(nextSchedule as unknown as Record<string, unknown>);
    updateSettingsMutation.mutate({
      notificationSchedule: nextSchedule as unknown as Record<string, unknown>,
    });
    setEditingSheet(null);
    showToast({ message: `Water reminder set to every ${intervalHours} hours` });
  };

  const handleQuietHoursToggle = (enabled: boolean) => {
    const nextSchedule: NotificationSchedule = {
      ...schedule,
      quietHours: {
        ...schedule.quietHours,
        enabled,
      },
    };
    setNotificationSchedule(nextSchedule as unknown as Record<string, unknown>);
    updateSettingsMutation.mutate({
      notificationSchedule: nextSchedule as unknown as Record<string, unknown>,
    });
    showToast({ message: enabled ? 'Quiet hours active' : 'Quiet hours disabled' });
  };

  const handleQuietWindowSelect = (start: string, end: string) => {
    const nextSchedule: NotificationSchedule = {
      ...schedule,
      quietHours: {
        ...schedule.quietHours,
        startTime: start,
        endTime: end,
      },
    };
    setNotificationSchedule(nextSchedule as unknown as Record<string, unknown>);
    updateSettingsMutation.mutate({
      notificationSchedule: nextSchedule as unknown as Record<string, unknown>,
    });
    setEditingSheet(null);
    showToast({ message: 'Quiet hours window updated' });
  };

  // Runs only from the permission card's button press: an explicit user action, never automatically.
  const handlePermissionAction = async () => {
    if (!permissionCard) return;
    if (permissionCard.action === 'open-settings') {
      try {
        await openSystemSettings();
      } catch {
        showToast({ message: 'Open system settings to allow notifications' });
      }
      return;
    }
    setEnablingPermission(true);
    try {
      const result = await enable();
      showToast({
        message: result?.permission.granted ? 'Notifications enabled' : 'Notification permission was not granted',
      });
    } catch {
      showToast({ message: 'Could not enable notifications' });
    } finally {
      setEnablingPermission(false);
    }
  };

  return (
    <Screen title="Notification settings" contentContainerStyle={styles.container}>
      {/* OS permission card: shown only while notifications are not allowed on this device */}
      {permissionCard && (
        <View style={[styles.permissionCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.permissionHeader}>
            <View style={[styles.iconBox, { backgroundColor: colors.surface2 }]}>
              <BellOff size={18} color={colors.ink} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.prefLabel, { color: colors.ink }]}>{permissionCard.title}</Text>
              <Text style={[styles.prefDesc, { color: colors.muted }]}>{permissionCard.body}</Text>
            </View>
          </View>
          <Button fullWidth size="md" loading={enablingPermission} onPress={handlePermissionAction}>
            {permissionCard.actionLabel}
          </Button>
        </View>
      )}

      {/* TEMPORARY: dev builds only, for Firebase console test sends. Remove after FCM testing. */}
      {__DEV__ ? <DevFcmTokenButton /> : null}

      {/* Master Toggle Card */}
      <View style={[styles.masterCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <View style={[styles.iconBox, { backgroundColor: colors.surface2 }]}>
          <Bell size={18} color={colors.ink} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.prefLabel, { color: colors.ink }]}>Allow notifications</Text>
          <Text style={[styles.prefDesc, { color: colors.muted }]}>
            Master switch for workout and hydration reminders
          </Text>
        </View>
        <Toggle checked={notificationsEnabled} onChange={handleMasterToggle} />
      </View>

      {/* Category List Card */}
      <View
        style={[
          styles.listCard,
          { backgroundColor: colors.surface, borderColor: colors.line, opacity: notificationsEnabled ? 1 : 0.6 },
        ]}
      >
        {preferences.map((p, idx) => {
          const Icon = notificationIcons[p.key];
          const isCategoryEnabled = (schedule[p.key] as any)?.enabled ?? p.enabled;

          // Contextual time button or interval button
          let buttonLabel: string | null = null;
          let onButtonPress: (() => void) | null = null;

          if (p.key === 'workout') {
            buttonLabel = workoutTime12h;
            onButtonPress = () => setEditingSheet('workout');
          } else if (p.key === 'water') {
            buttonLabel = `Every ${schedule.water.intervalHours || 2}h`;
            onButtonPress = () => setEditingSheet('water');
          } else if (p.time) {
            buttonLabel = p.time;
            onButtonPress = () => setEditingSheet(p.key);
          }

          let description = p.description;
          if (p.key === 'water') {
            description = `Every ${schedule.water.intervalHours || 2} hours, 8:00 AM – 8:00 PM`;
          }

          return (
            <View
              key={p.key}
              style={[
                styles.prefRow,
                { borderBottomColor: colors.line },
                idx === preferences.length - 1 && { borderBottomWidth: 0 },
              ]}
            >
              <View style={[styles.iconBox, { backgroundColor: colors.surface2 }]}>
                <Icon size={17} color={colors.ink} />
              </View>

              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.prefLabel, { color: colors.ink }]}>{p.label}</Text>
                <Text style={[styles.prefDesc, { color: colors.muted }]}>{description}</Text>
                {buttonLabel && isCategoryEnabled && (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    disabled={!notificationsEnabled}
                    onPress={() => onButtonPress && onButtonPress()}
                    style={{ alignSelf: 'flex-start', marginTop: 2 }}
                  >
                    <Text style={[styles.timeBtnText, { color: colors.ink }]}>{buttonLabel}</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Toggle
                checked={isCategoryEnabled}
                disabled={!notificationsEnabled}
                onChange={() => handleCategoryToggle(p.key)}
              />
            </View>
          );
        })}
      </View>

      {/* Updates sent by OnusFit (push + inbox). Each choice is saved to the server. */}
      <Text style={[styles.sectionHeading, { color: colors.muted }]}>Updates from OnusFit</Text>
      <View
        style={[
          styles.listCard,
          { backgroundColor: colors.surface, borderColor: colors.line, opacity: notificationsEnabled ? 1 : 0.6 },
        ]}
      >
        {SERVER_CATEGORIES.map((key, idx) => (
          <View
            key={key}
            style={[
              styles.prefRow,
              { borderBottomColor: colors.line },
              idx === SERVER_CATEGORIES.length - 1 && { borderBottomWidth: 0 },
            ]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.prefLabel, { color: colors.ink }]}>{CATEGORY_COPY[key].label}</Text>
              <Text style={[styles.prefDesc, { color: colors.muted }]}>{CATEGORY_COPY[key].description}</Text>
            </View>
            <Toggle
              checked={serverPrefs.categories[key]}
              disabled={!notificationsEnabled || !serverPrefs.loaded}
              onChange={async () => {
                const saved = await serverPrefs.toggle(key);
                if (!saved) showToast({ message: 'Could not save. Check your connection and try again.' });
              }}
            />
          </View>
        ))}
      </View>
      {serverPrefs.error && !serverPrefs.loaded && (
        <TouchableOpacity activeOpacity={0.7} onPress={() => void serverPrefs.reload()}>
          <Text style={[styles.footnote, { color: colors.muted }]}>Couldn’t load these settings. Tap to retry.</Text>
        </TouchableOpacity>
      )}

      {/* Quiet hours Card */}
      <View
        style={[
          styles.quietCard,
          { backgroundColor: colors.surface, borderColor: colors.line, opacity: notificationsEnabled ? 1 : 0.6 },
        ]}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.prefLabel, { color: colors.ink }]}>Quiet hours</Text>
          <TouchableOpacity
            activeOpacity={0.7}
            disabled={!notificationsEnabled}
            onPress={() => setEditingSheet('quiet')}
          >
            <Text style={[styles.prefDesc, { color: colors.muted }]}>
              No reminders {quietHoursLabel}
            </Text>
          </TouchableOpacity>
        </View>
        <Toggle
          checked={quietHoursEnabled}
          disabled={!notificationsEnabled}
          onChange={handleQuietHoursToggle}
        />
      </View>

      <Text style={[styles.footnote, { color: colors.muted }]}>
        Reminders adapt to your schedule and pause during quiet hours.
      </Text>

      {/* Workout Time Picker Sheet */}
      <BottomSheet
        open={editingSheet === 'workout'}
        onClose={() => setEditingSheet(null)}
        title="Workout reminder time"
        footer={
          <Button fullWidth size="lg" onPress={() => setEditingSheet(null)}>
            Done
          </Button>
        }
      >
        <View style={styles.timesContainer}>
          {workoutTimes.map((t) => (
            <Chip
              key={t}
              label={t}
              selected={workoutTime12h === t}
              onPress={() => handleWorkoutTimeSelect(t)}
            />
          ))}
        </View>
      </BottomSheet>

      {/* Water Interval Picker Sheet */}
      <BottomSheet
        open={editingSheet === 'water'}
        onClose={() => setEditingSheet(null)}
        title="Water reminder interval"
        footer={
          <Button fullWidth size="lg" onPress={() => setEditingSheet(null)}>
            Done
          </Button>
        }
      >
        <View style={styles.timesContainer}>
          {waterIntervalOptions.map((opt) => (
            <Chip
              key={opt.value}
              label={opt.label}
              selected={(schedule.water.intervalHours || 2) === opt.value}
              onPress={() => handleWaterIntervalSelect(opt.value)}
            />
          ))}
        </View>
      </BottomSheet>

      {/* Quiet Hours Window Picker Sheet */}
      <BottomSheet
        open={editingSheet === 'quiet'}
        onClose={() => setEditingSheet(null)}
        title="Quiet hours window"
        footer={
          <Button fullWidth size="lg" onPress={() => setEditingSheet(null)}>
            Done
          </Button>
        }
      >
        <View style={styles.timesContainer}>
          {quietHourWindows.map((win) => {
            const isSelected =
              schedule.quietHours.startTime === win.start && schedule.quietHours.endTime === win.end;
            return (
              <Chip
                key={win.label}
                label={win.label}
                selected={isSelected}
                onPress={() => handleQuietWindowSelect(win.start, win.end)}
              />
            );
          })}
        </View>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionHeading: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  container: {
    paddingBottom: 24,
    gap: 16,
  },
  masterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
  },
  permissionCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
  },
  permissionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  listCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  prefDesc: {
    fontSize: 12.5,
  },
  timeBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textDecorationLine: 'underline',
  },
  quietCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 24,
    borderWidth: 1,
  },
  footnote: {
    fontSize: 12,
    lineHeight: 16,
    paddingHorizontal: 6,
  },
  timesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 8,
  },
});
