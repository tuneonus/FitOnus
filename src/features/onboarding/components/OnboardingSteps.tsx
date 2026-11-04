import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import {
  Brain,
  HeartPulse,
  ShieldCheck,
  Watch,
  Smartphone,
  Check,
  Scale,
  Moon,
  Activity,
} from 'lucide-react-native';
import { OptionCard } from '../../../shared/components/ui/OptionCard';
import { Chip } from '../../../shared/components/ui/Chip';
import { Stepper } from '../../../shared/components/ui/Stepper';
import { TextField } from '../../../shared/components/ui/TextField';
import { SegmentedControl } from '../../../shared/components/ui/SegmentedControl';
import { Toggle } from '../../../shared/components/ui/Toggle';
import { Button } from '../../../shared/components/ui/Button';
import { useProfileSetupStore } from '../store/profileSetupStore';
import {
  allergyOptions,
  cuisineOptions,
  dietOptions,
  durationOptions,
  equipmentOptions,
  experienceLevels,
  fitnessGoals,
  workoutPlaces,
} from '../constants/options';
import { useTheme } from '@/hooks/use-theme';

export function StepIntro() {
  const { colors } = useTheme();
  const items = [
    { icon: Brain, text: 'Your goals and experience shape every plan.' },
    {
      icon: HeartPulse,
      text: 'Health data lets the coach read recovery — only if you allow it.',
    },
    { icon: ShieldCheck, text: 'You can edit or delete anything later.' },
  ];

  return (
    <View style={styles.introList}>
      {items.map(({ icon: Icon, text }) => (
        <View key={text} style={styles.introItem}>
          <View style={[styles.introIconBox, { backgroundColor: colors.surface2 }]}>
            <Icon size={20} color={colors.ink} />
          </View>
          <Text style={[styles.introText, { color: colors.ink }]}>{text}</Text>
        </View>
      ))}
    </View>
  );
}

export function StepPersonal() {
  const { colors } = useTheme();
  const { name, sex, update } = useProfileSetupStore();

  return (
    <View style={styles.stepContainer}>
      <TextField
        label="Your name"
        value={name}
        onChangeText={(val) => update({ name: val })}
        placeholder="Enter your name"
      />

      <View style={styles.sectionMargin}>
        <Text style={[styles.subHeading, { color: colors.ink }]}>Sex</Text>
        <Text style={[styles.caption, { color: colors.muted }]}>
          Used only to estimate calorie needs.
        </Text>

        <View style={styles.optionsStack}>
          {([
            ['male', 'Male'],
            ['female', 'Female'],
            ['unspecified', 'Prefer not to say'],
          ] as const).map(([val, label]) => (
            <OptionCard
              key={val}
              title={label}
              selected={sex === val}
              onSelect={() => update({ sex: val as any })}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

export function StepDob() {
  const { dobDay, dobMonth, dobYear, update } = useProfileSetupStore();

  return (
    <View style={styles.stepContainer}>
      <View style={styles.stepperGroup}>
        <Text style={styles.stepperLabel}>Day</Text>
        <Stepper
          value={dobDay}
          min={1}
          max={31}
          onChange={(val) => update({ dobDay: val })}
        />
      </View>
      <View style={styles.stepperGroup}>
        <Text style={styles.stepperLabel}>Month</Text>
        <Stepper
          value={dobMonth}
          min={1}
          max={12}
          onChange={(val) => update({ dobMonth: val })}
        />
      </View>
      <View style={styles.stepperGroup}>
        <Text style={styles.stepperLabel}>Year</Text>
        <Stepper
          value={dobYear}
          min={1940}
          max={2015}
          onChange={(val) => update({ dobYear: val })}
        />
      </View>
    </View>
  );
}

export function StepHeight() {
  const { heightCm, update } = useProfileSetupStore();
  return (
    <View style={styles.stepCenter}>
      <Stepper
        size="lg"
        value={heightCm}
        min={120}
        max={230}
        unit="cm"
        label="Height"
        onChange={(val) => update({ heightCm: val })}
      />
    </View>
  );
}

export function StepWeight() {
  const { weightKg, update } = useProfileSetupStore();
  return (
    <View style={styles.stepCenter}>
      <Stepper
        size="lg"
        value={weightKg}
        min={35}
        max={220}
        step={0.5}
        decimals={1}
        unit="kg"
        label="Weight"
        onChange={(val) => update({ weightKg: val })}
      />
    </View>
  );
}

export function StepExperience() {
  const { experience, update } = useProfileSetupStore();
  return (
    <View style={styles.optionsStack}>
      {experienceLevels.map((lvl) => (
        <OptionCard
          key={lvl.value}
          title={lvl.label}
          description={lvl.description}
          selected={experience === lvl.value}
          onSelect={() => update({ experience: lvl.value })}
        />
      ))}
    </View>
  );
}

export function StepGoal() {
  const { goal, update } = useProfileSetupStore();
  return (
    <View style={styles.optionsStack}>
      {fitnessGoals.map((g) => (
        <OptionCard
          key={g.value}
          icon={g.icon}
          title={g.label}
          description={g.description}
          selected={goal === g.value}
          onSelect={() => update({ goal: g.value })}
        />
      ))}
    </View>
  );
}

export function StepWorkoutPreference() {
  const { colors } = useTheme();
  const { place, daysPerWeek, update } = useProfileSetupStore();

  return (
    <View style={styles.stepContainer}>
      <View style={styles.optionsStack}>
        {workoutPlaces.map((p) => (
          <OptionCard
            key={p.value}
            icon={p.icon}
            title={p.label}
            description={p.description}
            selected={place === p.value}
            onSelect={() => update({ place: p.value })}
          />
        ))}
      </View>

      <View style={styles.sectionMargin}>
        <Text style={[styles.subHeading, { color: colors.ink }]}>
          Days per week
        </Text>
        <Stepper
          value={daysPerWeek}
          min={1}
          max={7}
          unit="days"
          label="Days per week"
          onChange={(val) => update({ daysPerWeek: val })}
        />
      </View>
    </View>
  );
}

export function StepEquipment() {
  const { equipment, toggleInList } = useProfileSetupStore();

  return (
    <View style={styles.chipsWrap}>
      {equipmentOptions.map((eq) => (
        <Chip
          key={eq}
          label={eq}
          selected={equipment.includes(eq)}
          onPress={() => toggleInList('equipment', eq)}
        />
      ))}
    </View>
  );
}

export function StepDuration() {
  const { durationMin, update } = useProfileSetupStore();
  return (
    <View style={styles.optionsStack}>
      {durationOptions.map((dur) => (
        <OptionCard
          key={dur}
          title={`${dur} minutes`}
          description={
            dur <= 30
              ? 'Quick, focused sessions'
              : dur === 45
              ? 'Balanced warm-up, main work, cool-down'
              : 'Full volume with complete rest periods'
          }
          selected={durationMin === dur}
          onSelect={() => update({ durationMin: dur })}
        />
      ))}
    </View>
  );
}

export function StepFood() {
  const { colors } = useTheme();
  const { diet, allergies, cuisines, update, toggleInList } =
    useProfileSetupStore();

  return (
    <View style={styles.stepContainer}>
      <Text style={[styles.subHeading, { color: colors.ink }]}>Diet style</Text>
      <View style={styles.optionsStack}>
        {dietOptions.map((d) => (
          <OptionCard
            key={d.value}
            title={d.label}
            selected={diet === d.value}
            onSelect={() => update({ diet: d.value })}
          />
        ))}
      </View>

      <View style={styles.sectionMargin}>
        <Text style={[styles.subHeading, { color: colors.ink }]}>
          Allergies & restrictions
        </Text>
        <View style={styles.chipsWrap}>
          {allergyOptions.map((al) => (
            <Chip
              key={al}
              label={al}
              selected={allergies.includes(al)}
              onPress={() => toggleInList('allergies', al)}
            />
          ))}
        </View>
      </View>

      <View style={styles.sectionMargin}>
        <Text style={[styles.subHeading, { color: colors.ink }]}>
          Preferred cuisines
        </Text>
        <View style={styles.chipsWrap}>
          {cuisineOptions.map((c) => (
            <Chip
              key={c}
              label={c}
              selected={cuisines.includes(c)}
              onPress={() => toggleInList('cuisines', c)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

export function StepHealthPermissions() {
  const { colors } = useTheme();
  const { healthAllowed, update } = useProfileSetupStore();

  return (
    <View style={styles.stepContainer}>
      <OptionCard
        icon={HeartPulse}
        title="Apple Health / Health Connect"
        description="Sync workouts, steps, heart rate and sleep automatically."
        selected={healthAllowed}
        onSelect={() => update({ healthAllowed: !healthAllowed })}
      />
    </View>
  );
}

export function StepDevice() {
  const { colors } = useTheme();
  const { deviceConnected, update } = useProfileSetupStore();
  const [connecting, setConnecting] = useState(false);

  const toggleDevice = () => {
    if (deviceConnected) {
      update({ deviceConnected: false });
    } else {
      setConnecting(true);
      setTimeout(() => {
        setConnecting(false);
        update({ deviceConnected: true });
      }, 1000);
    }
  };

  return (
    <View style={styles.stepContainer}>
      <OptionCard
        icon={Watch}
        title="Apple Watch / Wear OS"
        description={
          connecting
            ? 'Pairing watch…'
            : deviceConnected
            ? 'Connected: Apple Watch Series 9'
            : 'Pair your smartwatch for live metrics.'
        }
        selected={deviceConnected}
        onSelect={toggleDevice}
      />
    </View>
  );
}

export function StepSummary() {
  const { colors } = useTheme();
  const { name } = useProfileSetupStore();

  return (
    <View style={styles.stepCenter}>
      <View style={[styles.celebrationCircle, { backgroundColor: colors.accent }]}>
        <Check size={40} color={colors.accentInk} strokeWidth={2.8} />
      </View>
      <Text style={[styles.summaryTitle, { color: colors.ink }]}>
        Welcome, {name.split(' ')[0]}!
      </Text>
      <Text style={[styles.summaryBody, { color: colors.muted }]}>
        Your coach is ready. Daily targets, recommendations, and workouts are set
        up.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  introList: {
    gap: 16,
    paddingTop: 8,
  },
  introItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  introIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  stepContainer: {
    gap: 12,
  },
  stepCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  optionsStack: {
    gap: 8,
  },
  sectionMargin: {
    marginTop: 20,
  },
  subHeading: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  caption: {
    fontSize: 12.5,
    marginBottom: 8,
  },
  stepperGroup: {
    marginVertical: 10,
  },
  stepperLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  celebrationCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
  },
  summaryBody: {
    fontSize: 14.5,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 280,
  },
});
