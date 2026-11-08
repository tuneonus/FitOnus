import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Check, Minus, Plus, ShieldCheck, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';

export function SetupChoice({
  title,
  description,
  icon: Icon,
  selected,
  onPress,
  tile = false,
  multi = false,
}: {
  title: string;
  description?: string | undefined;
  icon?: LucideIcon | undefined;
  selected: boolean;
  onPress: () => void;
  tile?: boolean;
  multi?: boolean;
}) {
  const { colors } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const useTile = tile && width >= 350 && fontScale <= 1.3;
  return (
    <TouchableOpacity
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected }}
      activeOpacity={0.75}
      onPress={onPress}
      style={[
        styles.choice,
        useTile && styles.tile,
        {
          backgroundColor: selected ? colors.primaryLight : colors.surface,
          borderColor: selected ? colors.accentStrong : colors.line,
        },
      ]}
    >
      {Icon && (
        <View
          style={[
            styles.choiceIcon,
            { backgroundColor: selected ? colors.accent : colors.surface2 },
          ]}
        >
          <Icon size={22} color={selected ? colors.accentInk : colors.muted} strokeWidth={1.8} />
        </View>
      )}
      <View style={styles.choiceText}>
        <Text style={[styles.choiceTitle, { color: colors.ink }]}>{title}</Text>
        {description && (
          <Text style={[styles.choiceDescription, { color: colors.muted }]}>{description}</Text>
        )}
      </View>
      <View
        style={[
          styles.check,
          useTile && styles.tileCheck,
          {
            borderRadius: multi ? 7 : 12,
            borderColor: selected ? colors.accentStrong : colors.line,
            backgroundColor: selected ? colors.accent : 'transparent',
          },
        ]}
      >
        {selected && <Check size={13} strokeWidth={3} color={colors.accentInk} />}
      </View>
    </TouchableOpacity>
  );
}

export function SetupPill({
  label,
  selected,
  onPress,
  multi = true,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  multi?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected }}
      activeOpacity={0.75}
      onPress={onPress}
      style={[
        styles.pill,
        {
          backgroundColor: selected ? colors.accent : colors.surface,
          borderColor: selected ? colors.accentStrong : colors.line,
        },
      ]}
    >
      {selected && <Check size={14} color={colors.accentInk} />}
      <Text style={[styles.pillText, { color: selected ? colors.accentInk : colors.ink }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function SetupNote({
  children,
  icon: Icon = ShieldCheck,
}: {
  children: React.ReactNode;
  icon?: LucideIcon;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.note, { backgroundColor: colors.surface2 }]}>
      <Icon size={17} color={colors.accentStrong} />
      <Text style={[styles.noteText, { color: colors.muted }]}>{children}</Text>
    </View>
  );
}

export function MeasurementInput({
  value,
  onChange,
  label,
  unit,
  min,
  max,
  step = 1,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  unit: string;
  min: number;
  max: number;
  step?: number;
}) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const valid = Number.isFinite(value) && value >= min && value <= max;
  const adjust = (amount: number) => {
    const next = Math.min(
      max,
      Math.max(min, Math.round(((Number.isFinite(value) ? value : min) + amount) * 10) / 10),
    );
    setDraft(String(next));
    onChange(next);
  };
  return (
    <View style={styles.measurement}>
      <View
        style={[
          styles.measurementCard,
          {
            backgroundColor: colors.surface,
            borderColor: focused ? colors.accentStrong : colors.line,
          },
        ]}
      >
        <Text style={[styles.measurementLabel, { color: colors.muted }]}>
          {label.toUpperCase()}
        </Text>
        <TextInput
          accessibilityLabel={`${label} in ${unit}`}
          value={draft}
          keyboardType="decimal-pad"
          maxLength={6}
          selectTextOnFocus
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChangeText={(text) => {
            const next = text.replace(',', '.');
            setDraft(next);
            onChange(next.trim() ? Number(next) : NaN);
          }}
          style={[styles.measurementValue, { color: valid ? colors.ink : colors.bad }]}
        />
        <View style={[styles.unitBadge, { backgroundColor: colors.surface2 }]}>
          <Text style={[styles.unit, { color: colors.muted }]}>{unit}</Text>
        </View>
        <View
          style={styles.ruler}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {Array.from({ length: 29 }, (_, i) => (
            <View
              key={i}
              style={{
                width: i === 14 ? 3 : 1,
                height: i === 14 ? 44 : i % 4 === 2 ? 30 : 18,
                borderRadius: 2,
                backgroundColor: i === 14 ? colors.accentStrong : colors.line,
              }}
            />
          ))}
        </View>
        <View style={styles.adjustRow}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Decrease ${label.toLowerCase()}`}
            disabled={valid && value <= min}
            accessibilityState={{ disabled: valid && value <= min }}
            onPress={() => adjust(-step)}
            style={[
              styles.adjust,
              { backgroundColor: colors.surface2, opacity: valid && value <= min ? 0.4 : 1 },
            ]}
          >
            <Minus size={22} color={colors.ink} />
          </TouchableOpacity>
          <Text style={[styles.adjustHint, { color: colors.muted }]}>Tap to type or adjust</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Increase ${label.toLowerCase()}`}
            disabled={valid && value >= max}
            accessibilityState={{ disabled: valid && value >= max }}
            onPress={() => adjust(step)}
            style={[
              styles.adjust,
              { backgroundColor: colors.surface2, opacity: valid && value >= max ? 0.4 : 1 },
            ]}
          >
            <Plus size={22} color={colors.ink} />
          </TouchableOpacity>
        </View>
      </View>
      <Text
        accessibilityLiveRegion="polite"
        style={[styles.rangeHint, { color: valid ? colors.muted : colors.bad }]}
      >
        {valid
          ? `Enter a value between ${min} and ${max} ${unit}.`
          : `Please enter ${min}–${max} ${unit} to continue.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderWidth: 1.5,
    borderRadius: 22,
    minHeight: 80,
    width: '100%',
  },
  tile: {
    width: '48%',
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingTop: 18,
    minHeight: 145,
    flexGrow: 1,
  },
  choiceIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceText: { flex: 1, gap: 5 },
  choiceTitle: { fontSize: 15, fontWeight: '700', letterSpacing: -0.3 },
  choiceDescription: { fontSize: 12.5, lineHeight: 18 },
  check: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tileCheck: { position: 'absolute', right: 14, top: 16 },
  pill: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 16,
    borderWidth: 1,
  },
  pillText: { fontSize: 13, fontWeight: '600' },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 18,
    padding: 15,
    gap: 10,
    marginTop: 8,
  },
  noteText: { flex: 1, fontSize: 12.5, lineHeight: 19 },
  measurement: { gap: 16 },
  measurementCard: { borderRadius: 28, padding: 24, borderWidth: 1.5, alignItems: 'center' },
  measurementLabel: { fontSize: 11, letterSpacing: 1.5, fontWeight: '600' },
  measurementValue: {
    fontSize: 64,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -3,
    width: '100%',
    paddingVertical: 14,
    fontVariant: ['tabular-nums'],
  },
  unitBadge: { borderRadius: 12, paddingHorizontal: 15, paddingVertical: 6 },
  unit: { fontSize: 13, fontWeight: '600' },
  ruler: {
    height: 64,
    marginTop: 24,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  adjustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 10,
    marginTop: 12,
  },
  adjust: {
    width: 48,
    height: 48,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustHint: { fontSize: 11.5, flex: 1, textAlign: 'center' },
  rangeHint: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
