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
import { ShieldAlert, RefreshCw, Mail } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { useRemoteConfigStore } from '@/features/app-config/store/remoteConfigStore';

export function MaintenanceModal() {
  const { colors, isDark } = useTheme();
  const { config, isMaintenance, fetchConfig } = useRemoteConfigStore();
  const [isChecking, setIsChecking] = useState(false);

  if (!isMaintenance) {
    return null;
  }

  const handleRetry = async () => {
    setIsChecking(true);
    try {
      await fetchConfig(true);
    } finally {
      setIsChecking(false);
    }
  };

  const handleContactSupport = () => {
    if (config.support.email) {
      Linking.openURL(`mailto:${config.support.email}?subject=FitOnus%20Maintenance%20Inquiry`);
    } else if (config.support.website) {
      Linking.openURL(config.support.website);
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
          <View style={[styles.iconCircle, { backgroundColor: isDark ? '#451a03' : '#fef3c7' }]}>
            <ShieldAlert size={36} color="#d97706" />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>
            Under Scheduled Maintenance
          </Text>

          <Text style={[styles.message, { color: colors.muted }]}>
            {config.maintenance.message ||
              'FitOnus is currently undergoing scheduled maintenance. Please check back shortly.'}
          </Text>

          {config.maintenance.expectedEndTime && (
            <View style={[styles.timeBox, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <Text style={[styles.timeLabel, { color: colors.muted }]}>
                Expected Completion:
              </Text>
              <Text style={[styles.timeValue, { color: colors.text }]}>
                {config.maintenance.expectedEndTime}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.accent }]}
            onPress={handleRetry}
            disabled={isChecking}
            activeOpacity={0.8}
          >
            {isChecking ? (
              <ActivityIndicator size="small" color="#0f172a" />
            ) : (
              <>
                <RefreshCw size={16} color="#0f172a" style={styles.buttonIcon} />
                <Text style={styles.retryButtonText}>Check Status</Text>
              </>
            )}
          </TouchableOpacity>

          {(config.support.email || config.support.website) && (
            <TouchableOpacity
              style={styles.supportButton}
              onPress={handleContactSupport}
              activeOpacity={0.7}
            >
              <Mail size={14} color={colors.muted} style={styles.buttonIcon} />
              <Text style={[styles.supportButtonText, { color: colors.muted }]}>
                Contact Support
              </Text>
            </TouchableOpacity>
          )}
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
  timeBox: {
    width: '100%',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 24,
  },
  timeLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  timeValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  retryButton: {
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
  retryButtonText: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '700',
  },
  supportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  supportButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
