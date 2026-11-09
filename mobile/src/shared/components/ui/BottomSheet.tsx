import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TouchableWithoutFeedback,
  BackHandler,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { X } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { SHEET_SPRING, shouldDismissSheet } from '../../../app/navigation/screenMotion';

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
  const { height } = useWindowDimensions();
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const isSheetOpen = open ?? visible ?? isOpen ?? false;
  const [measuredHeight, setMeasuredHeight] = useState(height * 0.6);

  const dragY = useSharedValue(0);
  const isDismissing = useSharedValue(false);

  // Handle hardware back press on Android
  useEffect(() => {
    if (!isSheetOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [isSheetOpen, onClose]);

  // Reset drag position when sheet opens
  useEffect(() => {
    if (isSheetOpen) {
      dragY.set(0);
      isDismissing.set(false);
    }
  }, [isSheetOpen, dragY, isDismissing]);

  const panGesture = Gesture.Pan()
    .activeOffsetY([0, 8])
    .failOffsetY([-15, 0])
    .maxPointers(1)
    .onUpdate((event) => {
      if (!isDismissing.get()) {
        dragY.set(Math.max(0, event.translationY));
      }
    })
    .onEnd((event) => {
      if (isDismissing.get()) return;
      const targetHeight = measuredHeight || height * 0.6;
      if (shouldDismissSheet(dragY.get(), event.velocityY, targetHeight)) {
        isDismissing.set(true);
        dragY.set(
          withTiming(
            targetHeight,
            {
              duration: reducedMotion ? 0 : 180,
              easing: Easing.out(Easing.cubic),
            },
            (finished) => {
              if (finished) {
                runOnJS(onClose)();
              }
              dragY.set(0);
              isDismissing.set(false);
            }
          )
        );
      } else {
        dragY.set(withSpring(0, SHEET_SPRING));
      }
    })
    .onFinalize(() => {
      if (!isDismissing.get()) {
        dragY.set(withSpring(0, SHEET_SPRING));
      }
    });

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => {
    const targetHeight = measuredHeight || height * 0.6;
    const opacity = interpolate(
      dragY.value,
      [0, targetHeight],
      [1, 0.3],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  return (
    <Modal
      visible={isSheetOpen}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View style={[styles.backdrop, backdropAnimatedStyle]} />
        </TouchableWithoutFeedback>

        <Animated.View
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0) setMeasuredHeight(h);
          }}
          style={[
            styles.sheetContainer,
            {
              backgroundColor: colors.surface,
              paddingBottom: Math.max(insets.bottom, 16),
            },
            sheetAnimatedStyle,
          ]}
        >
          {/* Draggable Handle & Header */}
          <GestureDetector gesture={panGesture}>
            <View style={styles.dragZone}>
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
            </View>
          </GestureDetector>

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
        </Animated.View>
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
    ...StyleSheet.absoluteFill,
  },
  dragZone: {
    width: '100%',
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
