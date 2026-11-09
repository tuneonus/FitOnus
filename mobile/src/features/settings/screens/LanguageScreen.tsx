import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Globe, Languages } from 'lucide-react-native';
import { Screen } from '@/shared/components/ui/Screen';
import { OptionCard } from '@/shared/components/ui/OptionCard';
import { useSettingsStore, type LanguagePreference } from '@/shared/stores/settingsStore';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useUpdateSettings } from '@/features/profile/hooks/use-settings';
import { showToast } from '@/shared/stores/toastStore';

interface LanguageOption {
  value: LanguagePreference;
  title: string;
  description: string;
  icon: typeof Globe;
}

const languageOptions: LanguageOption[] = [
  {
    value: 'en',
    title: 'English',
    description: 'Default interface language · Fully available',
    icon: Globe,
  },
  {
    value: 'ta',
    title: 'தமிழ் (Tamil)',
    description: 'Saved to profile · UI translation in progress',
    icon: Languages,
  },
];

export function LanguageScreen() {
  const { colors } = useTheme();
  const { language, setLanguage } = useSettingsStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { mutate: updateSettings } = useUpdateSettings();

  const handleSelect = (lang: LanguagePreference) => {
    setLanguage(lang);

    if (isAuthenticated) {
      updateSettings({ language: lang });
    }

    if (lang === 'ta') {
      showToast({
        message: 'Tamil preference saved. Interface translation is coming in an upcoming release.',
      });
    } else {
      showToast({ message: 'Language set to English' });
    }
  };

  return (
    <Screen title="Language" contentContainerStyle={styles.container}>
      <View style={styles.optionsList}>
        {languageOptions.map((opt) => (
          <OptionCard
            key={opt.value}
            title={opt.title}
            description={opt.description}
            icon={opt.icon}
            selected={language === opt.value}
            onSelect={() => handleSelect(opt.value)}
          />
        ))}
      </View>

      <Text style={[styles.footnote, { color: colors.muted }]}>
        English is the default active interface language. Selecting தமிழ் (Tamil) securely saves
        your language preference to your account. Full Tamil localization is being prepared for a
        future release.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
    gap: 16,
  },
  optionsList: {
    gap: 10,
  },
  footnote: {
    fontSize: 12.5,
    lineHeight: 18,
    paddingHorizontal: 6,
  },
});
