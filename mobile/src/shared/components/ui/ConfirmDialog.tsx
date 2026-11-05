import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TouchableWithoutFeedback,
} from 'react-native';
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
  const isDialogOpen = open ?? visible ?? isOpen ?? false;
  const isDestructive = destructive || confirmTone === 'bad';

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
            <View
              style={[
                styles.dialog,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.line,
                },
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
                  onPress={onCancel}
                  style={styles.flexButton}
                />
                <Button
                  title={confirmLabel}
                  variant={destructive ? 'danger' : 'primary'}
                  onPress={onConfirm}
                  style={styles.flexButton}
                />
              </View>
            </View>
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
