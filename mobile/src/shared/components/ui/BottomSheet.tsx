import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TouchableWithoutFeedback,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';

export type BottomSheetProps = {
  open?: boolean;
  visible?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  title?: string | undefined;
  description?: string | undefined;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function BottomSheet({
  open,
  visible,
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const isSheetOpen = open ?? visible ?? isOpen ?? false;

  return (
    <Modal
      visible={isSheetOpen}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: colors.surface,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          {/* Handle */}
          <View style={styles.handleContainer}>
            <View
              style={[
                styles.handle,
                { backgroundColor: 'rgba(128, 128, 128, 0.25)' },
              ]}
            />
          </View>

          {/* Header */}
          {(title || description) && (
            <View style={styles.header}>
              <View style={styles.headerTitles}>
                {title ? (
                  <Text style={[styles.title, { color: colors.ink }]}>
                    {title}
                  </Text>
                ) : null}
                {description ? (
                  <Text style={[styles.description, { color: colors.muted }]}>
                    {description}
                  </Text>
                ) : null}
              </View>

              <TouchableOpacity
                onPress={onClose}
                activeOpacity={0.7}
                style={[styles.closeButton, { backgroundColor: colors.surface2 }]}
              >
                <X size={18} color={colors.ink} />
              </TouchableOpacity>
            </View>
          )}

          {/* Body */}
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>

          {/* Footer */}
          {footer && (
            <View
              style={[
                styles.footer,
                { borderTopColor: colors.line },
              ]}
            >
              {footer}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  sheetContainer: {
    maxHeight: '88%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitles: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
});
