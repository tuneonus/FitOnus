import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { WifiOff, AlertTriangle, Shield, Info } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';

export type BannerTone = 'offline' | 'error' | 'warning' | 'info';

export type StatusBannerProps = {
  tone: BannerTone;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
};

export function StatusBanner({
  tone,
  title,
  body,
  actionLabel,
  onAction,
  style,
}: StatusBannerProps) {
  const { colors } = useTheme();

  let Icon = Info;
  let iconColor = colors.sky;
  let bgColor = 'rgba(14, 150, 220, 0.1)';

  switch (tone) {
    case 'offline':
      Icon = WifiOff;
      iconColor = colors.ink;
      bgColor = 'rgba(128, 128, 128, 0.1)';
      break;
    case 'error':
      Icon = AlertTriangle;
      iconColor = colors.bad;
      bgColor = 'rgba(214, 40, 40, 0.1)';
      break;
    case 'warning':
      Icon = Shield;
      iconColor = colors.warn;
      bgColor = 'rgba(214, 120, 10, 0.1)';
      break;
    case 'info':
      Icon = Info;
      iconColor = colors.sky;
      bgColor = 'rgba(14, 150, 220, 0.1)';
      break;
  }

  return (
    <View style={[styles.banner, { backgroundColor: bgColor }, style]}>
      <Icon size={18} color={iconColor} style={styles.icon} />

      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
        {body ? <Text style={[styles.body, { color: colors.muted }]}>{body}</Text> : null}
      </View>

      {actionLabel && onAction ? (
        <TouchableOpacity
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          style={[styles.button, { backgroundColor: colors.surface }]}
        >
          <Text style={[styles.actionText, { color: colors.ink }]}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 18,
    marginVertical: 6,
  },
  icon: {
    marginTop: 2,
    marginRight: 10,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  button: {
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  actionText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
});
