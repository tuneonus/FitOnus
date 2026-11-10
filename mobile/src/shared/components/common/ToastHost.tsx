import { premium } from '@/shared/theme/premium';
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CheckCircle, AlertTriangle, Info } from 'lucide-react-native';
import { useToastStore } from '../../stores/toastStore';
import { useTheme } from '@/hooks/use-theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function ToastHost({ raised = false }: { raised?: boolean }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { toasts, dismiss } = useToastStore();
  const toast = toasts[toasts.length - 1];

  if (!toast) return null;

  const Icon = toast.tone === 'error' ? AlertTriangle : toast.tone === 'info' ? Info : CheckCircle;

  const iconColor = toast.tone === 'error' ? colors.bad : colors.accent;

  return (
    <View
      style={[
        styles.container,
        {
          top: Math.max(insets.top, 12) + 12,
          backgroundColor: colors.ink,
        },
      ]}
      testID="app-toast"
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
    >
      <Icon size={18} color={iconColor} style={styles.icon} />
      <Text style={[styles.message, { color: colors.bg }]}>{toast.message}</Text>

      {toast.actionLabel && toast.onAction ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={toast.actionLabel}
          activeOpacity={0.8}
          onPress={() => {
            toast.onAction?.();
            dismiss(toast.id);
          }}
          style={styles.actionBtn}
        >
          <Text style={[styles.actionLabel, { color: colors.accent }]}>{toast.actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: premium.layout.gutter,
    right: premium.layout.gutter,
    zIndex: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  icon: {
    marginRight: 12,
  },
  message: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  actionBtn: {
    marginLeft: 12,
    paddingHorizontal: 10,
    minHeight: premium.layout.touch,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
});
