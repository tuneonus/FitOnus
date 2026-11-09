import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { Button } from '@/shared/components/ui/Button';
import { Chip } from '@/shared/components/ui/Chip';
import { Stepper } from '@/shared/components/ui/Stepper';
import { showToast } from '@/shared/stores/toastStore';
import { useProfileSetupStore } from '../../onboarding/store/profileSetupStore';
import {
  durationOptions,
  equipmentOptions,
  experienceLevels,
  fitnessGoals,
  workoutPlaces,
} from '../../onboarding/constants/options';
import { useTheme } from '@/hooks/use-theme';
import { useProfile, useUpdateProfile } from '../hooks/use-profile';
import { useAuthStore } from '@/features/auth/stores/auth-store';

function Group({
  title,
  children,
  color,
}: {
  title: string;
  children: React.ReactNode;
  color?: string | undefined;
}) {
  return (
    <View style={styles.groupContainer}>
      <Text style={[styles.groupTitle, color ? { color } : null]}>{title}</Text>
      <View style={styles.chipsRow}>{children}</View>
    </View>
  );
}

export function FitnessPreferencesScreen() {
  const { colors } = useTheme();
  const { goBack } = useNavigation();
  const store = useProfileSetupStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data: serverProfile, refetch } = useProfile();
  const { mutateAsync: updateProfile, isPending: isSaving } = useUpdateProfile();

  const [d, setD] = useState({
    goal: store.goal,
    experience: store.experience,
    place: store.place,
    daysPerWeek: store.daysPerWeek,
    durationMin: store.durationMin,
    equipment: store.equipment,
  });

  React.useEffect(() => {
    if (serverProfile) {
      setD({
        goal: serverProfile.primaryGoal || store.goal,
        experience: serverProfile.experienceLevel || store.experience,
        place: serverProfile.preferredWorkoutPlace || store.place,
        daysPerWeek: serverProfile.workoutDaysPerWeek ?? store.daysPerWeek,
        durationMin: serverProfile.preferredWorkoutDurationMin ?? store.durationMin,
        equipment: serverProfile.availableEquipment.length > 0 ? [...serverProfile.availableEquipment] : store.equipment,
      });
    }
  }, [serverProfile]);

  const toggleEq = (e: string) =>
    setD({
      ...d,
      equipment: d.equipment.includes(e)
        ? d.equipment.filter((x) => x !== e)
        : [...d.equipment, e],
    });

  const save = async () => {
    if (isAuthenticated && serverProfile) {
      try {
        await updateProfile({
          version: serverProfile.version,
          primaryGoal: d.goal as any,
          experienceLevel: d.experience as any,
          preferredWorkoutPlace: d.place as any,
          workoutDaysPerWeek: d.daysPerWeek,
          preferredWorkoutDurationMin: d.durationMin,
          availableEquipment: d.equipment,
        });
        showToast({ message: 'Preferences saved · next plan will reflect them' });
        goBack();
      } catch (err: any) {
        if (err.code === 'VERSION_CONFLICT') {
          showToast({ message: 'Preferences updated elsewhere. Refreshed latest data.' });
          await refetch();
        } else {
          showToast({ message: err.message || 'Failed to save preferences' });
        }
      }
    } else {
      store.update(d);
      showToast({ message: 'Preferences saved · next plan will reflect them' });
      goBack();
    }
  };

  return (
    <Screen
      title="Fitness preferences"
      footer={
        <Button size="lg" fullWidth onPress={save} loading={isSaving}>
          Save preferences
        </Button>
      }
      contentContainerStyle={styles.container}
    >
      <Group title="Main goal" color={colors.muted}>
          {fitnessGoals.map((g) => (
            <Chip
              key={g.value}
              label={g.label}
              selected={d.goal === g.value}
              onPress={() => setD({ ...d, goal: g.value })}
            />
          ))}
        </Group>

        <Group title="Experience" color={colors.muted}>
          {experienceLevels.map((e) => (
            <Chip
              key={e.value}
              label={e.label}
              selected={d.experience === e.value}
              onPress={() => setD({ ...d, experience: e.value })}
            />
          ))}
        </Group>

        <Group title="Where you train" color={colors.muted}>
          {workoutPlaces.map((w) => (
            <Chip
              key={w.value}
              label={w.label}
              selected={d.place === w.value}
              onPress={() => setD({ ...d, place: w.value })}
            />
          ))}
        </Group>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.cardSubLabel, { color: colors.muted }]}>
            Training days per week
          </Text>
          <View style={{ marginTop: 8 }}>
            <Stepper
              label="Days per week"
              value={d.daysPerWeek}
              onChange={(v) => setD({ ...d, daysPerWeek: v })}
              min={1}
              max={7}
              unit="days"
            />
          </View>
        </View>

        <Group title="Session length" color={colors.muted}>
          {durationOptions.map((m) => (
            <Chip
              key={m}
              label={`${m} min`}
              selected={d.durationMin === m}
              onPress={() => setD({ ...d, durationMin: m })}
            />
          ))}
        </Group>

        <Group title="Available equipment" color={colors.muted}>
          {equipmentOptions.map((e) => (
            <Chip
              key={e}
              label={e}
              selected={d.equipment.includes(e)}
              onPress={() => toggleEq(e)}
            />
          ))}
        </Group>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
    gap: 18,
  },
  groupContainer: {
    gap: 8,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: '500',
    paddingHorizontal: 4,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
  },
  cardSubLabel: {
    fontSize: 13,
  },
});

