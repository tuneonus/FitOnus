import React from 'react';
import { View, StyleSheet, ScrollView, Image } from 'react-native';
import { Stack } from 'expo-router';
import { ScreenContainer } from '@/components/shared/screen-container';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/hooks/use-theme';
import { Spacing, BorderRadius } from '@/constants/theme';
import { StatCard } from '@/features/profile/components/stat-card';
import { SettingRow } from '@/features/profile/components/setting-row';
import { User, Activity, Target, Settings, Moon, Bell, Shield, LogOut } from 'lucide-react-native';

export default function ProfileScreen() {
  const { colors } = useTheme();

  return (
    <ScreenContainer edges={['top']} style={{ backgroundColor: colors.background }}>
      <Stack.Screen 
        options={{ 
          headerShown: true, 
          title: 'Profile',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }} 
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Header Section */}
        <View style={styles.header}>
          <View style={[styles.avatar, { backgroundColor: colors.primaryLight }]}>
            <User size={40} color={colors.primary} />
          </View>
          <View style={styles.headerText}>
            <Text variant="headlineMedium" style={{ color: colors.text }}>Alex Fitness</Text>
            <Text variant="bodyLarge" style={{ color: colors.textSecondary }}>alex@tuneonus.com</Text>
          </View>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <StatCard 
            label="Current Weight" 
            value="78.5 kg" 
            icon={Activity} 
            subValue="-2.5 kg this month" 
          />
          <View style={{ width: Spacing.sm }} />
          <StatCard 
            label="Target Goal" 
            value="75.0 kg" 
            icon={Target} 
            subValue="Hypertrophy" 
          />
        </View>

        {/* Settings Groups */}
        <View style={styles.settingsGroup}>
          <Text variant="labelLarge" style={[styles.groupTitle, { color: colors.textTertiary }]}>
            PREFERENCES
          </Text>
          <View style={[styles.card, { backgroundColor: colors.backgroundElement, borderColor: colors.border }]}>
            <SettingRow label="Account Settings" icon={Settings} onPress={() => {}} />
            <SettingRow label="Appearance" icon={Moon} value="System" onPress={() => {}} />
            <SettingRow label="Notifications" icon={Bell} onPress={() => {}} />
          </View>
        </View>

        <View style={styles.settingsGroup}>
          <Text variant="labelLarge" style={[styles.groupTitle, { color: colors.textTertiary }]}>
            ABOUT
          </Text>
          <View style={[styles.card, { backgroundColor: colors.backgroundElement, borderColor: colors.border }]}>
            <SettingRow label="Privacy Policy" icon={Shield} onPress={() => {}} />
            <SettingRow label="Terms of Service" icon={Shield} onPress={() => {}} />
            <SettingRow label="Log Out" icon={LogOut} destructive onPress={() => {}} />
          </View>
        </View>

        {/* Spacer for bottom tab bar */}
        <View style={{ height: 100 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  headerText: {
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: Spacing.xl,
  },
  settingsGroup: {
    marginBottom: Spacing.lg,
  },
  groupTitle: {
    marginBottom: Spacing.sm,
    marginLeft: Spacing.sm,
  },
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  }
});
