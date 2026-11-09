import React, { useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TouchableWithoutFeedback,
  BackHandler,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Button } from './Button';
import { useTheme } from '@/hooks/use-theme';

export type ConfirmDialogProps = {
  open?: boolean;
  visible?: boolean;
  isOpen?: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  confirmTone?: 'bad' | 'good' | 'warn' | string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  visible,
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  confirmTone,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const isDialogOpen = open ?? visible ?? isOpen ?? false;
  const isDestructive = destructive || confirmTone === 'bad';

  // Handle hardware back on Android
  useEffect(() => {
    if (!isDialogOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onCancel();
      return true;
    });
    return () => sub.remove();
  }, [isDialogOpen, onCancel]);

  const scale = useSharedValue(0.95);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (isDialogOpen) {
      if (reducedMotion) {
        scale.set(1);
        opacity.set(1);
      } else {
        scale.set(0.94);
        opacity.set(0);
        scale.set(withSpring(1, { damping: 20, stiffness: 300 }));
        opacity.set(withTiming(1, { duration: 180 }));
      }
    }
  }, [isDialogOpen, reducedMotion, scale, opacity]);

  const dialogAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Modal
      visible={isDialogOpen}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <Animated.View
              style={[
                styles.dialog,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.line,
                },
                dialogAnimatedStyle,
              ]}
            >
              <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
              <Text style={[styles.message, { color: colors.muted }]}>
                {message}
              </Text>

              <View style={styles.buttonRow}>
                <Button
                  title={cancelLabel}
                  variant="outline"
                  fullWidth
                  onPress={onCancel}
                  style={styles.flexButton}
                />
                <Button
                  title={confirmLabel}
                  variant={isDestructive ? 'danger' : 'primary'}
                  fullWidth
                  onPress={onConfirm}
                  style={styles.flexButton}
                />
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 28,
    borderWidth: 1,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  flexButton: {
    flex: 1,
  },
});
