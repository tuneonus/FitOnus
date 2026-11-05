import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { Button } from '@/shared/components/ui/Button';
import { Chip } from '@/shared/components/ui/Chip';
import { showToast } from '@/shared/stores/toastStore';
import { useProfileSetupStore } from '../../onboarding/store/profileSetupStore';
import {
  allergyOptions,
  cuisineOptions,
  dietOptions,
} from '../../onboarding/constants/options';
import { nutritionGoals } from '../../nutrition/constants/meals';
import { useTheme } from '@/hooks/use-theme';
import { useProfile, useUpdateProfile } from '../hooks/use-profile';
import { useAuthStore } from '@/features/auth/stores/auth-store';

export function NutritionPreferencesScreen() {
  const { colors } = useTheme();
  const { goBack } = useNavigation();
  const store = useProfileSetupStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data: serverProfile, refetch } = useProfile();
  const { mutateAsync: updateProfile, isPending: isSaving } = useUpdateProfile();

  const [d, setD] = useState({
    diet: store.diet,
    allergies: store.allergies,
    cuisines: store.cuisines,
  });

  React.useEffect(() => {
    if (serverProfile) {
      setD({
        diet: serverProfile.dietType || store.diet,
        allergies: serverProfile.allergies ? [...serverProfile.allergies] : store.allergies,
        cuisines: serverProfile.preferredCuisines?.length ? [...serverProfile.preferredCuisines] : store.cuisines,
      });
    }
  }, [serverProfile]);

  const toggle = (k: 'allergies' | 'cuisines', v: string) =>
    setD({
      ...d,
      [k]: d[k].includes(v) ? d[k].filter((x) => x !== v) : [...d[k], v],
    });

  const save = async () => {
    if (isAuthenticated && serverProfile) {
      try {
        await updateProfile({
          version: serverProfile.version,
          dietType: d.diet as any,
          allergies: d.allergies,
          preferredCuisines: d.cuisines,
        });
        showToast({ message: 'Saved · meal suggestions updated' });
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
      showToast({ message: 'Saved · meal suggestions updated' });
      goBack();
    }
  };

  return (
    <Screen
      title="Nutrition preferences"
      footer={
        <Button size="lg" fullWidth onPress={save} loading={isSaving}>
          Save preferences
        </Button>
      }
    >
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Diet */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionHeading, { color: colors.muted }]}>Diet</Text>
          <View style={styles.chipsRow}>
            {dietOptions.map((o) => (
              <Chip
                key={o.value}
                label={o.label}
                selected={d.diet === o.value}
                onPress={() => setD({ ...d, diet: o.value })}
              />
            ))}
          </View>
        </View>

        {/* Allergies */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionHeading, { color: colors.muted }]}>
            Allergies & intolerances
          </Text>
          <View style={styles.chipsRow}>
            {allergyOptions.map((a) => (
              <Chip
                key={a}
                label={a}
                selected={d.allergies.includes(a)}
                onPress={() => toggle('allergies', a)}
              />
            ))}
          </View>
          <Text style={[styles.footnote, { color: colors.muted }]}>
            Your coach will never suggest foods containing these.
          </Text>
        </View>

        {/* Cuisines */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionHeading, { color: colors.muted }]}>Favourite cuisines</Text>
          <View style={styles.chipsRow}>
            {cuisineOptions.map((c) => (
              <Chip
                key={c}
                label={c}
                selected={d.cuisines.includes(c)}
                onPress={() => toggle('cuisines', c)}
              />
            ))}
          </View>
        </View>

        {/* Daily targets */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.cardTitle, { color: colors.ink }]}>Daily targets</Text>
          <View style={styles.targetsGrid}>
            {[
              ['Calories', `${nutritionGoals.kcal.toLocaleString()}`],
              ['Protein', `${nutritionGoals.protein} g`],
              ['Carbs', `${nutritionGoals.carbs} g`],
              ['Fat', `${nutritionGoals.fat} g`],
              ['Fiber', `${nutritionGoals.fiber} g`],
            ].map(([l, v]) => (
              <View key={l} style={styles.targetItem}>
                <Text style={[styles.targetLabel, { color: colors.muted }]}>{l}</Text>
                <Text style={[styles.targetVal, { color: colors.ink }]}>{v}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.footnote, { color: colors.muted, marginTop: 12 }]}>
            Calculated from your goal, weight and activity. Ask your coach to adjust them.
          </Text>
        </View>
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
  sectionBlock: {
    gap: 8,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '500',
    paddingHorizontal: 4,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  footnote: {
    fontSize: 12,
    paddingHorizontal: 4,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  targetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 12,
  },
  targetItem: {
    width: '28%',
    gap: 2,
  },
  targetLabel: {
    fontSize: 12,
  },
  targetVal: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});

