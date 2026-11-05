import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Screen } from '@/shared/components/ui/Screen';
import { Toggle } from '@/shared/components/ui/Toggle';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { Chip } from '@/shared/components/ui/Chip';
import { Button } from '@/shared/components/ui/Button';
import { showToast } from '@/shared/stores/toastStore';
import { useNotificationsStore } from '../store/notificationsStore';
import { notificationIcons } from '../constants/notificationIcons';
import { useTheme } from '@/hooks/use-theme';
import type { NotificationKind } from '../types/notification';

const times = ['6:30 AM', '7:00 AM', '8:00 AM', '6:00 PM', '8:00 PM', '9:30 PM', '10:30 PM'];

export function NotificationPreferencesScreen() {
  const { colors } = useTheme();
  const { preferences, togglePreference, setPreferenceTime } = useNotificationsStore();
  const [quiet, setQuiet] = useState(true);
  const [editing, setEditing] = useState<NotificationKind | null>(null);
  const current = preferences.find((p) => p.key === editing);

  return (
    <Screen title="Notification settings">
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          {preferences.map((p, idx) => {
            const Icon = notificationIcons[p.key];
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
                  <Text style={[styles.prefDesc, { color: colors.muted }]}>{p.description}</Text>
                  {p.time && p.enabled && (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => setEditing(p.key)}
                      style={{ alignSelf: 'flex-start', marginTop: 2 }}
                    >
                      <Text style={[styles.timeBtnText, { color: colors.ink }]}>{p.time}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <Toggle
                  checked={p.enabled}
                  onChange={() => togglePreference(p.key)}
                />
              </View>
            );
          })}
        </View>

        {/* Quiet hours */}
        <View style={[styles.quietCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.prefLabel, { color: colors.ink }]}>Quiet hours</Text>
            <Text style={[styles.prefDesc, { color: colors.muted }]}>
              No reminders 11:00 PM – 6:00 AM
            </Text>
          </View>
          <Toggle checked={quiet} onChange={setQuiet} />
        </View>

        <Text style={[styles.footnote, { color: colors.muted }]}>
          Reminders adapt to your data — e.g. no walk nudge if you’ve already hit your steps.
        </Text>
      </ScrollView>

      {/* Time Picker Sheet */}
      <BottomSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={current ? `${current.label} time` : undefined}
        footer={
          <Button
            fullWidth
            size="lg"
            onPress={() => {
              setEditing(null);
              showToast({ message: 'Reminder time saved' });
            }}
          >
            Done
          </Button>
        }
      >
        <View style={styles.timesContainer}>
          {times.map((t) => (
            <Chip
              key={t}
              label={t}
              selected={current?.time === t}
              onPress={() => editing && setPreferenceTime(editing, t)}
            />
          ))}
        </View>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 16,
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

