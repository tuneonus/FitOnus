import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import {
  Brain,
  Dumbbell,
  HeartPulse,
  Settings,
  Target,
  User,
  Utensils,
  Watch,
} from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { IconButton } from '@/shared/components/ui/IconButton';
import { ListGroup, ListRow } from '@/shared/components/ui/ListRow';
import { Badge } from '@/shared/components/ui/Badge';
import { useProfileSetupStore } from '../../onboarding/store/profileSetupStore';
import { useGoalsStore } from '../../goals/store/goalsStore';
import { useMemoryStore } from '../../ai-memory/store/memoryStore';
import { useHealthStore } from '../../health-integration/store/healthStore';
import { fitnessGoals } from '../../onboarding/constants/options';
import { useTheme } from '@/hooks/use-theme';
import { useProfile } from '../hooks/use-profile';

export function ProfileScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const { data: serverProfile } = useProfile();
  const p = useProfileSetupStore();
  const activeGoals = useGoalsStore((s) => s.goals.filter((g) => g.status === 'active').length);
  const memories = useMemoryStore((s) => s.items.length);
  const { connection, platform, watchConnected } = useHealthStore();

  const goalLabel = fitnessGoals.find((g) => g.value === p.goal)?.label ?? 'Not set';
  const initials = p.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <Screen
      headerRight={
        <IconButton icon={Settings} label="Settings" onPress={() => navigate('settings')} />
      }
    >
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* User Card */}
        <View style={styles.userSection}>
          <View style={[styles.avatarCircle, { backgroundColor: colors.ink }]}>
            <Text style={[styles.avatarText, { color: colors.bg }]}>{initials}</Text>
          </View>
          <Text style={[styles.userName, { color: colors.ink }]}>{p.name}</Text>
          <Text style={[styles.userMeta, { color: colors.muted }]}>
            Member since Sep 2026 · {goalLabel}
          </Text>
        </View>

        {/* Quick Stats 3 Columns */}
        <View style={[styles.statsCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.statCol}>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Weight</Text>
            <Text style={[styles.statVal, { color: colors.ink }]}>
              {p.weightKg}
              <Text style={[styles.statUnit, { color: colors.muted }]}> kg</Text>
            </Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.line }]} />
          <View style={styles.statCol}>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Height</Text>
            <Text style={[styles.statVal, { color: colors.ink }]}>
              {p.heightCm}
              <Text style={[styles.statUnit, { color: colors.muted }]}> cm</Text>
            </Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.line }]} />
          <View style={styles.statCol}>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Workouts</Text>
            <Text style={[styles.statVal, { color: colors.ink }]}>47</Text>
          </View>
        </View>

        {/* Preferences Group */}
        <ListGroup>
          <ListRow
            icon={User}
            title="Personal information"
            subtitle="Name, birthday, height, weight"
            onPress={() => navigate('personalInfo')}
          />
          <ListRow
            icon={Dumbbell}
            title="Fitness & workout preferences"
            subtitle={`${p.daysPerWeek} days · ${p.durationMin} min · ${p.place}`}
            onPress={() => navigate('fitnessPreferences')}
          />
          <ListRow
            icon={Utensils}
            title="Nutrition preferences"
            subtitle={`${p.diet[0]?.toUpperCase() ?? ''}${p.diet.slice(1)} · ${
              p.cuisines.join(', ') || 'Any cuisine'
            }`}
            onPress={() => navigate('nutritionPreferences')}
          />
          <ListRow
            icon={Target}
            title="Goals"
            value={`${activeGoals} active`}
            onPress={() => navigate('goals')}
          />
        </ListGroup>

        {/* Devices & Integrations Group */}
        <ListGroup>
          <ListRow
            icon={HeartPulse}
            title={platform === 'ios' ? 'Apple Health' : 'Health Connect'}
            trailing={
              connection === 'connected' ? (
                <Badge tone="good">Connected</Badge>
              ) : (
                <Badge tone="warn">Not connected</Badge>
              )
            }
            onPress={() => navigate('healthIntegration')}
          />
          <ListRow
            icon={Watch}
            title="Apple Watch"
            value={watchConnected ? 'Series 9' : 'Not paired'}
            onPress={() => navigate('appleWatch')}
          />
          <ListRow
            icon={Brain}
            title="AI memory"
            value={`${memories} saved`}
            onPress={() => navigate('aiMemory')}
          />
        </ListGroup>

        {/* Settings Group */}
        <ListGroup>
          <ListRow
            icon={Settings}
            title="Settings"
            onPress={() => navigate('settings')}
          />
        </ListGroup>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 18,
  },
  userSection: {
    alignItems: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 26,
    fontWeight: '700',
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  userMeta: {
    fontSize: 14,
  },
  statsCard: {
    flexDirection: 'row',
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 16,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statDivider: {
    width: 1,
    height: '80%',
    alignSelf: 'center',
  },
  statLabel: {
    fontSize: 12,
  },
  statVal: {
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statUnit: {
    fontSize: 11,
    fontWeight: 'normal',
  },
});

