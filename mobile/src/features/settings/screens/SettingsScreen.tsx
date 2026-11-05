import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import {
  Bell,
  Brain,
  CircleUserRound,
  HeartPulse,
  LogOut,
  Palette,
  Ruler,
  Shield,
  Watch,
} from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { ListGroup, ListRow } from '@/shared/components/ui/ListRow';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { ConfirmDialog } from '@/shared/components/ui/ConfirmDialog';
import { Units, useSettingsStore } from '@/shared/stores/settingsStore';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { AuthService } from '@/features/auth/services/auth-service';
import { useSettings, useUpdateSettings } from '@/features/profile/hooks/use-settings';

export function SettingsScreen() {
  const { colors } = useTheme();
  const { navigate, reset } = useNavigation();
  const { theme, units, setUnits } = useSettingsStore();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentUser = useAuthStore((s) => s.user);
  useSettings();
  const { mutate: updateSettings } = useUpdateSettings();

  const handleUnitChange = (nextUnits: Units) => {
    setUnits(nextUnits);
    if (isAuthenticated) {
      updateSettings({ unitSystem: nextUnits });
    }
  };

  return (
    <Screen title="Settings">
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* General */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionHeading, { color: colors.muted }]}>General</Text>
          <ListGroup>
            <ListRow
              icon={Palette}
              title="Appearance"
              value={theme[0]?.toUpperCase() + theme.slice(1)}
              onPress={() => navigate('appearance')}
            />
            <ListRow
              icon={Bell}
              title="Notifications"
              onPress={() => navigate('notificationPreferences')}
            />
            <View style={[styles.unitsRow, { borderTopColor: colors.line, borderTopWidth: 1 }]}>
              <View style={[styles.unitsIconBox, { backgroundColor: colors.surface2 }]}>
                <Ruler size={18} color={colors.ink} />
              </View>
              <Text style={[styles.unitsLabel, { color: colors.ink }]}>Units</Text>
              <View style={{ width: 140 }}>
                <SegmentedControl<Units>
                  options={[
                    { value: 'metric', label: 'kg · cm' },
                    { value: 'imperial', label: 'lb · in' },
                  ]}
                  value={units}
                  onChange={handleUnitChange}
                />
              </View>
            </View>
          </ListGroup>
        </View>

        {/* Health & data */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionHeading, { color: colors.muted }]}>Health & data</Text>
          <ListGroup>
            <ListRow
              icon={HeartPulse}
              title="Health permissions"
              subtitle="Apple Health / Health Connect"
              onPress={() => navigate('healthIntegration')}
            />
            <ListRow
              icon={Watch}
              title="Connected devices"
              onPress={() => navigate('appleWatch')}
            />
            <ListRow
              icon={Brain}
              title="AI memory controls"
              onPress={() => navigate('aiMemory')}
            />
            <ListRow
              icon={Shield}
              title="Privacy"
              onPress={() => navigate('privacy')}
            />
          </ListGroup>
        </View>

        {/* Account */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionHeading, { color: colors.muted }]}>Account</Text>
          <ListGroup>
            <ListRow
              icon={CircleUserRound}
              title="Account settings"
              subtitle={currentUser?.email ?? 'aarav.mehta@gmail.com'}
              onPress={() => navigate('account')}
            />
            <ListRow
              icon={LogOut}
              title="Log out"
              destructive
              chevron={false}
              onPress={() => setConfirmLogout(true)}
            />
          </ListGroup>
        </View>

        <Text style={[styles.footerText, { color: colors.muted }]}>
          FitOnus 1.0 (prototype) · by TuneOnus
        </Text>
      </ScrollView>

      <ConfirmDialog
        open={confirmLogout}
        title="Log out of FitOnus?"
        message="Your data stays in your account. You’ll need to log in again to see it on this device."
        confirmLabel="Log out"
        destructive
        onCancel={() => setConfirmLogout(false)}
        onConfirm={async () => {
          setConfirmLogout(false);
          await AuthService.logout();
          reset('welcome');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 18,
  },
  sectionBlock: {
    gap: 8,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '500',
    paddingHorizontal: 4,
  },
  unitsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  unitsIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitsLabel: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  footerText: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 8,
  },
});

