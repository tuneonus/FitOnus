import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Download, Eye } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { Toggle } from '@/shared/components/ui/Toggle';
import { Button } from '@/shared/components/ui/Button';
import { ListGroup, ListRow } from '@/shared/components/ui/ListRow';
import { showToast } from '@/shared/stores/toastStore';
import { useTheme } from '@/hooks/use-theme';

const aiAccess = [
  'Today’s health data and trends',
  'Workout, meal and weight logs',
  'Goals and saved AI memory',
  'Sleep and recovery history',
];

export function PrivacyScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const [prefs, setPrefs] = useState({ analytics: true, improve: false, photos: true });
  const [exporting, setExporting] = useState(false);

  const toggle = (k: keyof typeof prefs) => (v: boolean) =>
    setPrefs({ ...prefs, [k]: v });

  const rows: { key: keyof typeof prefs; title: string; sub: string }[] = [
    {
      key: 'photos',
      title: 'Keep meal photos',
      sub: 'Otherwise deleted right after analysis',
    },
    {
      key: 'analytics',
      title: 'App usage analytics',
      sub: 'Anonymous crash and performance data',
    },
    {
      key: 'improve',
      title: 'Help improve the coach',
      sub: 'Share de-identified chats for quality review',
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
              <Toggle checked={prefs[r.key]} onChange={toggle(r.key)} />
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
            loading={exporting}
            onPress={() => {
              setExporting(true);
              setTimeout(() => {
                setExporting(false);
                showToast({ message: 'Export requested — we’ll email a download link' });
              }, 1200);
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

