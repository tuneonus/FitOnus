import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { Stepper } from '@/shared/components/ui/Stepper';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { showToast } from '@/shared/stores/toastStore';
import { ProfileSetup, useProfileSetupStore } from '../../onboarding/store/profileSetupStore';
import { useTheme } from '@/hooks/use-theme';
import { useProfile, useUpdateProfile } from '../hooks/use-profile';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { formatHeight, formatWeight } from '@/shared/utils/unit-conversion';

export function PersonalInfoScreen() {
  const { colors } = useTheme();
  const { goBack } = useNavigation();
  const store = useProfileSetupStore();
  const units = useSettingsStore((s) => s.units);
  const isImperial = units === 'imperial';
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data: serverProfile, refetch } = useProfile();
  const { mutateAsync: updateProfile, isPending: isSaving } = useUpdateProfile();

  const [draft, setDraft] = useState({
    name: store.name,
    sex: store.sex,
    dob: `${store.dobYear}-${String(store.dobMonth).padStart(2, '0')}-${String(
      store.dobDay
    ).padStart(2, '0')}`,
    heightCm: store.heightCm,
    weightKg: store.weightKg,
  });
  const [error, setError] = useState<string | undefined>();

  // Sync draft if server profile loads
  React.useEffect(() => {
    if (serverProfile) {
      setDraft({
        name: serverProfile.name || store.name,
        sex: serverProfile.sex || store.sex,
        dob: serverProfile.dateOfBirth || `${store.dobYear}-${String(store.dobMonth).padStart(2, '0')}-${String(store.dobDay).padStart(2, '0')}`,
        heightCm: serverProfile.heightCm ?? store.heightCm,
        weightKg: serverProfile.currentWeightKg ?? store.weightKg,
      });
    }
  }, [serverProfile]);

  const save = async () => {
    if (!draft.name.trim()) return setError('Enter your name.');
    const [y = 1995, m = 6, d = 15] = draft.dob.split('-').map(Number);

    if (isAuthenticated && serverProfile) {
      try {
        await updateProfile({
          version: serverProfile.version,
          name: draft.name.trim(),
          sex: draft.sex,
          dateOfBirth: draft.dob,
          heightCm: draft.heightCm,
          currentWeightKg: draft.weightKg,
        });
        showToast({ message: 'Personal information saved' });
        goBack();
      } catch (err: any) {
        if (err.code === 'VERSION_CONFLICT') {
          showToast({ message: 'Profile was modified concurrently. Refreshed with latest data.' });
          await refetch();
        } else {
          setError(err.message || 'Failed to save personal information');
        }
      }
    } else {
      store.update({
        name: draft.name.trim(),
        sex: draft.sex,
        dobYear: y,
        dobMonth: m,
        dobDay: d,
        heightCm: draft.heightCm,
        weightKg: draft.weightKg,
      });
      showToast({ message: 'Personal information saved' });
      goBack();
    }
  };

  return (
    <Screen
      title="Personal information"
      footer={
        <Button size="lg" fullWidth onPress={save} loading={isSaving}>
          Save
        </Button>
      }
    >
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <TextField
          label="Full name"
          value={draft.name}
          onChangeText={(val) => {
            setDraft({ ...draft, name: val });
            setError(undefined);
          }}
          error={error}
          autoComplete="name"
        />

        <TextField
          label="Date of birth (YYYY-MM-DD)"
          value={draft.dob}
          onChangeText={(val) => setDraft({ ...draft, dob: val })}
        />

        <View style={styles.fieldBlock}>
          <Text style={[styles.fieldLabel, { color: colors.ink }]}>
            Sex (used for calorie estimates)
          </Text>
          <SegmentedControl<ProfileSetup['sex']>
            options={[
              { value: 'male', label: 'Male' },
              { value: 'female', label: 'Female' },
              { value: 'unspecified', label: 'Prefer not' },
            ]}
            value={draft.sex}
            onChange={(sex) => setDraft({ ...draft, sex })}
          />
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.cardSubLabel, { color: colors.muted }]}>
            Height {isImperial ? `(${formatHeight(draft.heightCm, 'imperial')})` : ''}
          </Text>
          <View style={{ marginTop: 8 }}>
            <Stepper
              label="Height"
              value={draft.heightCm}
              onChange={(v) => setDraft({ ...draft, heightCm: v })}
              min={120}
              max={230}
              unit="cm"
            />
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.cardSubLabel, { color: colors.muted }]}>
            Starting weight {isImperial ? `(${formatWeight(draft.weightKg, 'imperial')})` : ''}
          </Text>
          <View style={{ marginTop: 8 }}>
            <Stepper
              label="Weight"
              value={draft.weightKg}
              onChange={(v) => setDraft({ ...draft, weightKg: v })}
              step={0.1}
              decimals={1}
              min={30}
              max={250}
              unit="kg"
            />
          </View>
          <Text style={[styles.cardFootnote, { color: colors.muted }]}>
            Daily weigh-ins are logged from the Weight screen.
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
  fieldBlock: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    paddingHorizontal: 2,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
  },
  cardSubLabel: {
    fontSize: 13,
  },
  cardFootnote: {
    marginTop: 10,
    fontSize: 12,
  },
});

