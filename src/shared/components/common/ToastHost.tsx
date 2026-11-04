import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CheckCircle, AlertTriangle, Info } from 'lucide-react-native';
import { useToastStore } from '../../stores/toastStore';
import { useTheme } from '@/hooks/use-theme';

export function ToastHost({ raised = false }: { raised?: boolean }) {
  const { colors } = useTheme();
  const { toasts, dismiss } = useToastStore();
  const toast = toasts[toasts.length - 1];

  if (!toast) return null;

  const Icon =
    toast.tone === 'error'
      ? AlertTriangle
      : toast.tone === 'info'
      ? Info
      : CheckCircle;

  const iconColor = toast.tone === 'error' ? colors.bad : colors.accent;

  return (
    <View
      style={[
        styles.container,
        {
          bottom: raised ? 100 : 36,
          backgroundColor: colors.ink,
        },
      ]}
      pointerEvents="box-none"
    >
      <Icon size={18} color={iconColor} style={styles.icon} />
      <Text style={[styles.message, { color: colors.bg }]} numberOfLines={2}>
        {toast.message}
      </Text>

      {toast.actionLabel && toast.onAction ? (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => {
            toast.onAction?.();
            dismiss(toast.id);
          }}
          style={styles.actionBtn}
        >
          <Text style={[styles.actionLabel, { color: colors.accent }]}>
            {toast.actionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
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
    paddingVertical: 6,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
});

