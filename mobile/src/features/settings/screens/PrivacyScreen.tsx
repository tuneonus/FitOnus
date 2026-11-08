import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Download, Eye } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { Toggle } from '@/shared/components/ui/Toggle';
import { Button } from '@/shared/components/ui/Button';
import { ListGroup, ListRow } from '@/shared/components/ui/ListRow';
import { showToast } from '@/shared/stores/toastStore';
import { useTheme } from '@/hooks/use-theme';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { useUpdateSettings } from '@/features/profile/hooks/use-settings';

const aiAccess = [
  'Today’s health data and trends',
  'Workout, meal and weight logs',
  'Goals and saved AI memory',
  'Sleep and recovery history',
];

export function PrivacyScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();

  const privacyAnalytics = useSettingsStore((s) => s.privacyAnalytics);
  const privacyPhotoRetention = useSettingsStore((s) => s.privacyPhotoRetention);
  const privacyCoachSharing = useSettingsStore((s) => s.privacyCoachSharing);
  const setPrivacy = useSettingsStore((s) => s.setPrivacy);
  const updateSettings = useUpdateSettings();

  const handleToggle = async (
    key: 'privacyAnalytics' | 'privacyPhotoRetention' | 'privacyCoachSharing',
    nextVal: boolean,
  ) => {
    const prevVal =
      key === 'privacyAnalytics'
        ? privacyAnalytics
        : key === 'privacyPhotoRetention'
        ? privacyPhotoRetention
        : privacyCoachSharing;

    setPrivacy({ [key]: nextVal });

    try {
      await updateSettings.mutateAsync({ [key]: nextVal });
    } catch {
      setPrivacy({ [key]: prevVal });
      showToast({ message: 'Failed to update privacy preference on server.' });
    }
  };

  const rows: {
    key: 'privacyPhotoRetention' | 'privacyAnalytics' | 'privacyCoachSharing';
    title: string;
    sub: string;
    checked: boolean;
  }[] = [
    {
      key: 'privacyPhotoRetention',
      title: 'Keep meal photos',
      sub: 'Otherwise deleted right after analysis',
      checked: privacyPhotoRetention,
    },
    {
      key: 'privacyAnalytics',
      title: 'App usage analytics',
      sub: 'Anonymous crash and performance data',
      checked: privacyAnalytics,
    },
    {
      key: 'privacyCoachSharing',
      title: 'Help improve the coach',
      sub: 'Share de-identified chats for quality review',
      checked: privacyCoachSharing,
    },
  ];

  return (
    <Screen title="Privacy">
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* What your coach can read hero */}
        <View style={[styles.heroCard, { backgroundColor: colors.surface2 }]}>
          <View style={styles.heroHeader}>
            <Eye size={16} color={colors.accent} />
            <Text style={[styles.heroTitle, { color: colors.ink }]}>
              What your coach can read
            </Text>
          </View>
          <View style={styles.accessList}>
            {aiAccess.map((a) => (
              <View key={a} style={styles.accessRow}>
                <View style={[styles.dot, { backgroundColor: colors.accent }]} />
                <Text style={[styles.accessText, { color: colors.muted }]}>{a}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.heroFootnote, { color: colors.muted }]}>
            Your health data is never sold or used for advertising. AI answers are guidance, not medical diagnoses.
          </Text>
        </View>

        {/* Toggles */}
        <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          {rows.map((r, idx) => (
            <View
              key={r.key}
              style={[
                styles.toggleRow,
                { borderBottomColor: colors.line },
                idx === rows.length - 1 && { borderBottomWidth: 0 },
              ]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.toggleTitle, { color: colors.ink }]}>{r.title}</Text>
                <Text style={[styles.toggleSub, { color: colors.muted }]}>{r.sub}</Text>
              </View>
              <Toggle checked={r.checked} onChange={(v) => handleToggle(r.key, v)} />
            </View>
          ))}
        </View>

        {/* Links & Export */}
        <View style={{ gap: 12 }}>
          <ListGroup>
            <ListRow
              title="Health permissions"
              subtitle="Choose which data types FitOnus can read"
              onPress={() => navigate('healthIntegration')}
            />
            <ListRow
              title="AI memory"
              subtitle="View, edit or delete what the coach remembers"
              onPress={() => navigate('aiMemory')}
            />
          </ListGroup>

          <Button
            fullWidth
            variant="outline"
            icon={Download}
            onPress={() => {
              showToast({ message: 'Self-service data export is planned for a future compliance release.' });
            }}
          >
            Export my data
          </Button>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 16,
  },
  heroCard: {
    borderRadius: 28,
    padding: 20,
    gap: 10,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  accessList: {
    gap: 6,
    marginTop: 2,
  },
  accessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  accessText: {
    fontSize: 13.5,
  },
  heroFootnote: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  listCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  toggleTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  toggleSub: {
    fontSize: 12.5,
  },
});
