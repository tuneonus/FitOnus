import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Smartphone, Moon, Sun } from 'lucide-react-native';
import { Screen } from '@/shared/components/ui/Screen';
import { OptionCard } from '@/shared/components/ui/OptionCard';
import { ThemePreference, useSettingsStore } from '@/shared/stores/settingsStore';
import { useTheme } from '@/hooks/use-theme';

const options: {
  value: ThemePreference;
  title: string;
  description: string;
  icon: typeof Sun;
}[] = [
  {
    value: 'light',
    title: 'Light',
    description: 'Warm paper background, ink text',
    icon: Sun,
  },
  {
    value: 'dark',
    title: 'Dark',
    description: 'Deep ink background, easier at night',
    icon: Moon,
  },
  {
    value: 'system',
    title: 'Match system',
    description: 'Follow your phone’s setting',
    icon: Smartphone,
  },
];

export function AppearanceScreen() {
  const { colors, setThemeMode } = useTheme();
  const { theme, setTheme } = useSettingsStore();

  const handleSelect = (v: ThemePreference) => {
    setTheme(v);
    setThemeMode(v);
  };

  return (
    <Screen title="Appearance">
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.optionsList}>
          {options.map((o) => (
            <OptionCard
              key={o.value}
              title={o.title}
              description={o.description}
              icon={o.icon}
              selected={theme === o.value}
              onSelect={() => handleSelect(o.value)}
            />
          ))}
        </View>

        <Text style={[styles.footnote, { color: colors.muted }]}>
          Changes apply immediately. Chart colors are tuned for contrast in both themes.
        </Text>
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
  optionsList: {
    gap: 10,
  },
  footnote: {
    fontSize: 12.5,
    lineHeight: 17,
    paddingHorizontal: 6,
  },
});
