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
  let bgColor = colors.infoLight;

  switch (tone) {
    case 'offline':
      Icon = WifiOff;
      iconColor = colors.ink;
      bgColor = colors.surface2;
      break;
    case 'error':
      Icon = AlertTriangle;
      iconColor = colors.bad;
      bgColor = colors.errorLight;
      break;
    case 'warning':
      Icon = Shield;
      iconColor = colors.warn;
      bgColor = colors.warningLight;
      break;
    case 'info':
      Icon = Info;
      iconColor = colors.sky;
      bgColor = colors.infoLight;
      break;
  }

  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      style={[styles.banner, { backgroundColor: bgColor }, style]}
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.surface }]}>
        <Icon size={16} color={iconColor} strokeWidth={2.2} />
      </View>

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
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    marginVertical: 6,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  button: {
    minHeight: 40,
    minWidth: 56,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
