import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { ArrowUpCircle, RefreshCw, ExternalLink } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { useRemoteConfigStore } from '@/features/app-config/store/remoteConfigStore';
import { Config } from '@/constants/config';

export function ForceUpdateModal() {
  const { colors, isDark } = useTheme();
  const { config, isForceUpdate, fetchConfig } = useRemoteConfigStore();
  const [isChecking, setIsChecking] = useState(false);

  if (!isForceUpdate) {
    return null;
  }

  const handleOpenStore = () => {
    const url =
      config.forceUpdate.storeUrl ||
      'https://play.google.com/store/apps/details?id=com.fitonus.app';
    Linking.openURL(url).catch(() => {});
  };

  const handleCheckAgain = async () => {
    setIsChecking(true);
    try {
      await fetchConfig(true);
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <Modal
      visible={true}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
    >
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={styles.card}>
          <View style={[styles.iconCircle, { backgroundColor: isDark ? '#064e3b' : '#d1fae5' }]}>
            <ArrowUpCircle size={36} color="#059669" />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>
            App Update Required
          </Text>

          <Text style={[styles.message, { color: colors.muted }]}>
            {config.forceUpdate.updateMessage ||
              'A critical update is required to continue using FitOnus. Please update from the Google Play Store.'}
          </Text>

          <View style={[styles.versionBox, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <View style={styles.versionCol}>
              <Text style={[styles.versionLabel, { color: colors.muted }]}>Installed</Text>
              <Text style={[styles.versionValue, { color: colors.text }]}>
                v{Config.APP_VERSION}
              </Text>
            </View>
            <View style={[styles.versionDivider, { backgroundColor: colors.line }]} />
            <View style={styles.versionCol}>
              <Text style={[styles.versionLabel, { color: colors.muted }]}>Required</Text>
              <Text style={[styles.versionValue, { color: '#059669' }]}>
                v{config.minVersion.androidMinVersion}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.accent }]}
            onPress={handleOpenStore}
            activeOpacity={0.8}
          >
            <ExternalLink size={16} color="#0f172a" style={styles.buttonIcon} />
            <Text style={styles.primaryButtonText}>Update from Play Store</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleCheckAgain}
            disabled={isChecking}
            activeOpacity={0.7}
          >
            {isChecking ? (
              <ActivityIndicator size="small" color={colors.muted} />
            ) : (
              <>
                <RefreshCw size={14} color={colors.muted} style={styles.buttonIcon} />
                <Text style={[styles.secondaryButtonText, { color: colors.muted }]}>
                  I have updated, check again
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 20,
  },
  versionBox: {
    width: '100%',
    flexDirection: 'row',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 24,
  },
  versionCol: {
    alignItems: 'center',
  },
  versionDivider: {
    width: 1,
    height: 32,
  },
  versionLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  versionValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  primaryButton: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  buttonIcon: {
    marginRight: 8,
  },
  primaryButtonText: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
