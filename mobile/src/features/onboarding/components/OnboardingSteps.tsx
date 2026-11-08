import React, { useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import {
  Sparkles,
  HeartPulse,
  ShieldCheck,
  Watch,
  Check,
  Moon,
  Dumbbell,
  CalendarDays,
  Sprout,
  Trophy,
  Clock3,
  Footprints,
  Target,
  Utensils,
  Cable,
  Bike,
  CircleOff,
  PersonStanding,
  Scale,
  StretchHorizontal,
  Activity,
  type LucideIcon,
} from 'lucide-react-native';
import { TextField } from '@/shared/components/ui/TextField';
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
import { MeasurementInput, SetupChoice, SetupNote, SetupPill } from './OnboardingControls';
import { isValidBirthday } from '../utils/onboarding';

export function StepIntro() {
  const { colors } = useTheme();
  return (
    <View style={styles.stack}>
      <View style={[styles.introHero, { backgroundColor: colors.hero }]}>
        <View
          style={styles.orbit}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View style={styles.orbitRing} />
          <View style={[styles.coachCore, { backgroundColor: colors.accent }]}>
            <Sparkles size={36} color={colors.accentInk} strokeWidth={1.6} />
          </View>
          {[
            { icon: Dumbbell, top: 3, left: 22 },
            { icon: Moon, top: 51, left: 145 },
            { icon: HeartPulse, top: 124, left: 42 },
          ].map(({ icon: Icon, top, left }) => (
            <View
              key={top}
              style={[
                styles.orbitIcon,
                { top, left, backgroundColor: colors.hero, borderColor: 'rgba(244,244,238,0.16)' },
              ]}
            >
              <Icon size={19} color={colors.accent} />
            </View>
          ))}
        </View>
        <Text style={[styles.introHeroTitle, { color: colors.heroInk }]}>
          One coach. Your whole routine.
        </Text>
        <Text style={[styles.introHeroBody, { color: colors.heroMuted }]}>
          Training, nutrition and recovery, brought together around you.
        </Text>
        <View style={styles.heroTags}>
          {['Train', 'Eat', 'Recover'].map((label) => (
            <View key={label} style={styles.heroTag}>
              <Text style={[styles.heroTagText, { color: colors.heroInk }]}>{label}</Text>
            </View>
          ))}
        </View>
      </View>
      {[
        {
          icon: Target,
          title: 'Tell us what matters',
          body: 'Your starting point and the goals you care about.',
        },
        {
          icon: CalendarDays,
          title: 'Make it fit your life',
          body: 'Your schedule, equipment and favorite foods.',
        },
        {
          icon: ShieldCheck,
          title: 'Keep it on your terms',
          body: 'Health connections are optional. Edit your choices anytime.',
        },
      ].map(({ icon: Icon, title, body }) => (
        <View key={title} style={styles.featureRow}>
          <View style={[styles.featureIcon, { backgroundColor: colors.surface }]}>
            <Icon size={21} color={colors.accentStrong} />
          </View>
          <View style={styles.flex}>
            <Text style={[styles.featureTitle, { color: colors.ink }]}>{title}</Text>
            <Text style={[styles.caption, { color: colors.muted }]}>{body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function StepPersonal() {
  const { colors } = useTheme();
  const { name, sex, update } = useProfileSetupStore();
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <View style={styles.stack}>
      <View
        style={[styles.identityCard, { backgroundColor: colors.surface, borderColor: colors.line }]}
      >
        <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
          {initial ? (
            <Text style={[styles.avatarLetter, { color: colors.accentInk }]}>{initial}</Text>
          ) : (
            <PersonStanding size={32} color={colors.accentInk} />
          )}
        </View>
        <Text style={[styles.featureTitle, { color: colors.ink }]}>
          {name.trim()
            ? `Nice to meet you, ${name.trim().split(' ')[0]}.`
            : 'Your coach is ready to meet you.'}
        </Text>
        <Text style={[styles.caption, { color: colors.muted }]}>Let’s make this personal.</Text>
      </View>
      <TextField
        accessibilityLabel="Your name"
        label="Your name"
        value={name}
        onChangeText={(value) => update({ name: value })}
        placeholder="What do your friends call you?"
        autoComplete="given-name"
        autoCapitalize="words"
        maxLength={80}
        returnKeyType="done"
      />
      <View style={styles.stack}>
        <Text style={[styles.sectionTitle, { color: colors.ink }]}>Sex for calorie estimates</Text>
        <Text style={[styles.caption, { color: colors.muted }]}>
          Choose what you’re comfortable sharing.
        </Text>
        <View style={styles.wrap}>
          {(
            [
              ['male', 'Male'],
              ['female', 'Female'],
              ['unspecified', 'Prefer not to say'],
            ] as const
          ).map(([value, label]) => (
            <SetupPill
              key={value}
              label={label}
              selected={sex === value}
              multi={false}
              onPress={() => update({ sex: value })}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

export function StepDob() {
  const { colors } = useTheme();
  const { dobDay, dobMonth, dobYear, update } = useProfileSetupStore();
  const [day, setDay] = useState(String(dobDay).padStart(2, '0'));
  const [month, setMonth] = useState(String(dobMonth).padStart(2, '0'));
  const [year, setYear] = useState(String(dobYear));
  const monthInput = useRef<React.ComponentRef<typeof TextInput>>(null);
  const yearInput = useRef<React.ComponentRef<typeof TextInput>>(null);
  const valid = isValidBirthday(dobDay, dobMonth, dobYear);
  const dateLabel = valid
    ? new Date(dobYear, dobMonth - 1, dobDay).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Your date of birth';
  return (
    <View style={styles.stack}>
      <View
        style={[styles.datePreview, { backgroundColor: colors.surface, borderColor: colors.line }]}
      >
        <View style={[styles.featureIcon, { backgroundColor: colors.primaryLight }]}>
          <CalendarDays size={26} color={colors.accentStrong} />
        </View>
        <Text style={[styles.datePreviewValue, { color: colors.ink }]}>{dateLabel}</Text>
        <Text style={[styles.caption, { color: colors.muted }]}>
          A little context for your coach.
        </Text>
      </View>
      <View style={styles.dateRow}>
        {[
          {
            label: 'Day',
            value: day,
            length: 2,
            ref: undefined,
            change: (text: string) => {
              setDay(text);
              update({ dobDay: text ? Number(text) : NaN });
              if (text.length === 2) monthInput.current?.focus();
            },
          },
          {
            label: 'Month',
            value: month,
            length: 2,
            ref: monthInput,
            change: (text: string) => {
              setMonth(text);
              update({ dobMonth: text ? Number(text) : NaN });
              if (text.length === 2) yearInput.current?.focus();
            },
          },
          {
            label: 'Year',
            value: year,
            length: 4,
            ref: yearInput,
            change: (text: string) => {
              setYear(text);
              update({ dobYear: text ? Number(text) : NaN });
            },
          },
        ].map((field) => (
          <View
            key={field.label}
            style={[styles.dateField, field.label === 'Year' && { flex: 1.4 }]}
          >
            <Text style={[styles.inputLabel, { color: colors.muted }]}>{field.label}</Text>
            <TextInput
              ref={field.ref}
              accessibilityLabel={`Birth ${field.label.toLowerCase()}`}
              value={field.value}
              keyboardType="number-pad"
              maxLength={field.length}
              selectTextOnFocus
              onChangeText={(text) => field.change(text.replace(/\D/g, ''))}
              style={[
                styles.dateInput,
                {
                  backgroundColor: colors.surface,
                  borderColor: valid ? colors.line : colors.bad,
                  color: colors.ink,
                },
              ]}
            />
          </View>
        ))}
      </View>
      {!valid && (
        <Text accessibilityLiveRegion="polite" style={[styles.caption, { color: colors.bad }]}>
          Enter a valid date in the past to continue.
        </Text>
      )}
      <SetupNote>
        Your date of birth helps personalize your plan. It isn’t shown to other members.
      </SetupNote>
    </View>
  );
}

export function StepHeight() {
  const { heightCm, update } = useProfileSetupStore();
  return (
    <MeasurementInput
      value={heightCm}
      onChange={(heightCm) => update({ heightCm })}
      label="Your height"
      unit="cm"
      min={120}
      max={230}
    />
  );
}

export function StepWeight() {
  const { weightKg, update } = useProfileSetupStore();
  return (
    <View style={styles.stack}>
      <MeasurementInput
        value={weightKg}
        onChange={(weightKg) => update({ weightKg })}
        label="Starting weight"
        unit="kg"
        min={35}
        max={220}
        step={0.5}
      />
      <SetupNote icon={Scale}>
        Progress is more than a number. You can keep your measurements up to date later.
      </SetupNote>
    </View>
  );
}

export function StepExperience() {
  const { experience, update } = useProfileSetupStore();
  const icons = [Sprout, Dumbbell, Trophy];
  return (
    <View style={styles.stack}>
      {experienceLevels.map((level, index) => (
        <SetupChoice
          key={level.value}
          title={level.label}
          description={level.description}
          icon={icons[index]}
          selected={experience === level.value}
          onPress={() => update({ experience: level.value })}
        />
      ))}
      <SetupNote icon={Footprints}>
        Starting fresh or starting again, there’s room to grow from here.
      </SetupNote>
    </View>
  );
}

export function StepGoal() {
  const { goal, update } = useProfileSetupStore();
  return (
    <View style={styles.stack}>
      {fitnessGoals.map((item) => (
        <SetupChoice
          key={item.value}
          icon={item.icon}
          title={item.label}
          description={item.description}
          selected={goal === item.value}
          onPress={() => update({ goal: item.value })}
        />
      ))}
    </View>
  );
}

export function StepWorkoutPreference() {
  const { colors } = useTheme();
  const { place, daysPerWeek, update } = useProfileSetupStore();
  return (
    <View style={styles.stack}>
      <View style={styles.grid}>
        {workoutPlaces.map((item) => (
          <SetupChoice
            key={item.value}
            tile
            icon={item.icon}
            title={item.label}
            description={item.description}
            selected={place === item.value}
            onPress={() => update({ place: item.value })}
          />
        ))}
      </View>
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.ink }]}>How many days each week?</Text>
        <View style={styles.daysRow}>
          {Array.from({ length: 7 }, (_, index) => index + 1).map((day) => (
            <TouchableOpacity
              key={day}
              accessibilityRole="radio"
              accessibilityLabel={`${day} ${day === 1 ? 'day' : 'days'} per week`}
              accessibilityState={{ checked: daysPerWeek === day }}
              onPress={() => update({ daysPerWeek: day })}
              style={[
                styles.dayButton,
                {
                  backgroundColor: daysPerWeek === day ? colors.accent : colors.surface,
                  borderColor: daysPerWeek === day ? colors.accentStrong : colors.line,
                },
              ]}
            >
              <Text
                style={[
                  styles.dayValue,
                  { color: daysPerWeek === day ? colors.accentInk : colors.ink },
                ]}
              >
                {day}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[styles.caption, { color: colors.muted }]}>
          {daysPerWeek} {daysPerWeek === 1 ? 'session' : 'sessions'} a week, built around your
          routine.
        </Text>
      </View>
    </View>
  );
}

const equipmentIcons: Record<string, LucideIcon> = {
  Barbell: Dumbbell,
  Dumbbells: Dumbbell,
  Kettlebells: Dumbbell,
  'Cable machine': Cable,
  'Pull-up bar': StretchHorizontal,
  'Resistance bands': StretchHorizontal,
  Bench: Dumbbell,
  Treadmill: Footprints,
  Bike,
  None: CircleOff,
};
export function StepEquipment() {
  const { colors } = useTheme();
  const { equipment, toggleInList } = useProfileSetupStore();
  return (
    <View style={styles.stack}>
      <Text style={[styles.selectionCount, { color: colors.accentStrong }]}>
        {equipment.includes('None')
          ? 'Bodyweight training selected'
          : `${equipment.length} selected`}
      </Text>
      <View style={styles.grid}>
        {equipmentOptions.map((item) => (
          <SetupChoice
            key={item}
            tile
            multi
            icon={equipmentIcons[item]}
            title={item === 'None' ? 'Just bodyweight' : item}
            selected={equipment.includes(item)}
            onPress={() => toggleInList('equipment', item)}
          />
        ))}
      </View>
    </View>
  );
}

export function StepDuration() {
  const { colors } = useTheme();
  const { durationMin, update } = useProfileSetupStore();
  return (
    <View style={styles.stack}>
      <View style={styles.grid}>
        {durationOptions.map((duration) => (
          <SetupChoice
            key={duration}
            tile
            icon={Clock3}
            title={`${duration} minutes`}
            description={
              duration === 30
                ? 'Short & focused'
                : duration === 45
                  ? 'A balanced session'
                  : duration === 60
                    ? 'Time for the full routine'
                    : 'Room for extra work'
            }
            selected={durationMin === duration}
            onPress={() => update({ durationMin: duration })}
          />
        ))}
      </View>
      <View style={[styles.timeSummary, { backgroundColor: colors.hero }]}>
        <Clock3 size={22} color={colors.accent} />
        <View style={styles.flex}>
          <Text style={[styles.featureTitle, { color: colors.heroInk }]}>
            {durationMin} minutes, made for you.
          </Text>
          <Text style={[styles.caption, { color: colors.heroMuted }]}>
            Your warm-up, training and cool-down in one session.
          </Text>
        </View>
      </View>
    </View>
  );
}

export function StepFood() {
  const { colors } = useTheme();
  const { diet, allergies, cuisines, update, toggleInList } = useProfileSetupStore();
  return (
    <View style={styles.stack}>
      <View style={styles.stack}>
        {dietOptions.map((item) => (
          <SetupChoice
            key={item.value}
            icon={item.icon}
            title={item.label}
            selected={diet === item.value}
            onPress={() => update({ diet: item.value })}
          />
        ))}
      </View>
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.ink }]}>Allergies & restrictions</Text>
        <Text style={[styles.caption, { color: colors.muted }]}>
          Select any that apply, or leave these empty.
        </Text>
        <View style={styles.wrap}>
          {allergyOptions.map((item) => (
            <SetupPill
              key={item}
              label={item}
              selected={allergies.includes(item)}
              onPress={() => toggleInList('allergies', item)}
            />
          ))}
        </View>
      </View>
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.ink }]}>
          What’s usually on your plate?
        </Text>
        <Text style={[styles.caption, { color: colors.muted }]}>Pick the cuisines you enjoy.</Text>
        <View style={styles.wrap}>
          {cuisineOptions.map((item) => (
            <SetupPill
              key={item}
              label={item}
              selected={cuisines.includes(item)}
              onPress={() => toggleInList('cuisines', item)}
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
    <View style={styles.stack}>
      <View
        style={[
          styles.connectionHero,
          { backgroundColor: colors.surface, borderColor: colors.line },
        ]}
      >
        <View style={[styles.connectionIcon, { backgroundColor: colors.primaryLight }]}>
          <HeartPulse size={40} color={colors.accentStrong} strokeWidth={1.5} />
        </View>
        <Text style={[styles.connectionTitle, { color: colors.ink }]}>A little more in sync.</Text>
        <Text style={[styles.connectionBody, { color: colors.muted }]}>
          Bring your activity and recovery into one place when you connect your health app.
        </Text>
        <View style={styles.wrap}>
          {[
            { icon: Footprints, label: 'Steps' },
            { icon: HeartPulse, label: 'Heart rate' },
            { icon: Moon, label: 'Sleep' },
          ].map(({ icon: Icon, label }) => (
            <View key={label} style={[styles.dataTag, { backgroundColor: colors.surface2 }]}>
              <Icon size={15} color={colors.muted} />
              <Text style={[styles.caption, { color: colors.muted }]}>{label}</Text>
            </View>
          ))}
        </View>
      </View>
      <SetupChoice
        multi
        icon={HeartPulse}
        title={
          Platform.OS === 'ios'
            ? 'Apple Health'
            : Platform.OS === 'android'
              ? 'Health Connect'
              : 'Apple Health / Health Connect'
        }
        description="Include health data in my setup preferences."
        selected={healthAllowed}
        onPress={() => update({ healthAllowed: !healthAllowed })}
      />
      <SetupNote>
        You control access. Selecting this preference doesn’t grant device permissions; finish
        connecting in Settings.
      </SetupNote>
    </View>
  );
}

export function StepDevice() {
  const { colors } = useTheme();
  const { deviceConnected, update } = useProfileSetupStore();
  return (
    <View style={styles.stack}>
      <View
        style={[styles.connectionHero, { backgroundColor: colors.hero, borderColor: colors.hero }]}
      >
        <View
          style={[
            styles.watchFace,
            { backgroundColor: colors.hero, borderColor: colors.heroMuted },
          ]}
        >
          <HeartPulse size={32} color={colors.accent} />
          <Text style={[styles.watchFaceText, { color: colors.heroInk }]}>FITONUS</Text>
        </View>
        <Text style={[styles.connectionTitle, { color: colors.heroInk }]}>
          Your wrist. More insight.
        </Text>
        <Text style={[styles.connectionBody, { color: colors.heroMuted }]}>
          A smartwatch can bring heart rate, sleep and activity into your daily picture.
        </Text>
      </View>
      <SetupChoice
        multi
        icon={Watch}
        title="I use a smartwatch"
        description="Apple Watch or Wear OS. Finish pairing in Settings."
        selected={deviceConnected}
        onPress={() => update({ deviceConnected: !deviceConnected })}
      />
      <SetupNote>
        No watch needed to get started. Your workouts and meal logging are ready either way.
      </SetupNote>
    </View>
  );
}

export function StepSummary() {
  const { colors } = useTheme();
  const { name, goal, daysPerWeek, durationMin, diet } = useProfileSetupStore();
  const goalLabel = fitnessGoals.find((item) => item.value === goal)?.label ?? 'Your goals';
  const dietLabel = dietOptions.find((item) => item.value === diet)?.label ?? 'Your preferences';
  return (
    <View style={styles.stack}>
      <View style={[styles.readyCard, { backgroundColor: colors.hero }]}>
        <View style={[styles.readyCircle, { backgroundColor: colors.accent }]}>
          <Check size={40} color={colors.accentInk} strokeWidth={2.5} />
        </View>
        <Text style={[styles.readyTitle, { color: colors.heroInk }]}>
          {name.trim().split(' ')[0] || 'You'}, let’s make it happen.
        </Text>
        <Text style={[styles.connectionBody, { color: colors.heroMuted }]}>
          Your preferences are in place. We’ll take the next step together.
        </Text>
      </View>
      <Text style={[styles.sectionTitle, { color: colors.ink }]}>Made around your life</Text>
      {[
        { icon: Target, title: goalLabel, body: 'A direction that matters to you' },
        {
          icon: Dumbbell,
          title: `${daysPerWeek} days · ${durationMin} min`,
          body: 'Training that fits your week',
        },
        {
          icon: Utensils,
          title: dietLabel,
          body: 'Food suggestions with your preferences in mind',
        },
      ].map(({ icon: Icon, title, body }) => (
        <View key={title} style={styles.featureRow}>
          <View style={[styles.featureIcon, { backgroundColor: colors.surface }]}>
            <Icon size={20} color={colors.accentStrong} />
          </View>
          <View style={styles.flex}>
            <Text style={[styles.featureTitle, { color: colors.ink }]}>{title}</Text>
            <Text style={[styles.caption, { color: colors.muted }]}>{body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stack: { gap: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  section: { gap: 10, marginTop: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', letterSpacing: -0.3 },
  caption: { fontSize: 12.5, lineHeight: 19 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 6 },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: { fontSize: 14, fontWeight: '600', lineHeight: 21 },
  introHero: {
    borderRadius: 28,
    padding: 24,
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 8,
  },
  orbit: { width: 200, height: 180, alignItems: 'center', justifyContent: 'center' },
  orbitRing: {
    position: 'absolute',
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 1,
    borderColor: 'rgba(244,244,238,0.15)',
  },
  coachCore: {
    width: 90,
    height: 90,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-8deg' }],
  },
  orbitIcon: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introHeroTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginTop: 10,
  },
  introHeroBody: { fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  heroTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 18,
  },
  heroTag: {
    backgroundColor: 'rgba(244,244,238,0.08)',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  heroTagText: { fontSize: 11, fontWeight: '600' },
  identityCard: { padding: 22, borderWidth: 1, borderRadius: 24, alignItems: 'center', gap: 7 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  avatarLetter: { fontSize: 30, fontWeight: '700' },
  datePreview: { alignItems: 'center', padding: 24, gap: 12, borderWidth: 1, borderRadius: 26 },
  datePreviewValue: { fontSize: 23, fontWeight: '700', letterSpacing: -0.7, textAlign: 'center' },
  dateRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  dateField: { flex: 1, gap: 8 },
  inputLabel: { fontSize: 12, fontWeight: '600' },
  dateInput: {
    minHeight: 66,
    paddingHorizontal: 6,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1.5,
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  daysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dayButton: {
    flex: 1,
    minWidth: 40,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayValue: { fontSize: 16, fontWeight: '700' },
  selectionCount: { fontSize: 12, fontWeight: '600' },
  timeSummary: {
    padding: 20,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 8,
  },
  connectionHero: { borderWidth: 1, borderRadius: 28, padding: 24, alignItems: 'center', gap: 14 },
  connectionIcon: {
    width: 92,
    height: 92,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  connectionTitle: { fontSize: 23, fontWeight: '700', letterSpacing: -0.6, textAlign: 'center' },
  connectionBody: { fontSize: 13.5, lineHeight: 21, textAlign: 'center' },
  dataTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
  },
  watchFace: {
    width: 100,
    height: 120,
    borderRadius: 30,
    borderWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginVertical: 18,
    transform: [{ rotate: '-8deg' }],
  },
  watchFaceText: { fontSize: 9, letterSpacing: 1.5, fontWeight: '600' },
  readyCard: { borderRadius: 28, padding: 28, alignItems: 'center', gap: 18, marginBottom: 12 },
  readyCircle: {
    width: 90,
    height: 90,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
    transform: [{ rotate: '-6deg' }],
  },
  readyTitle: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.7,
  },
});
