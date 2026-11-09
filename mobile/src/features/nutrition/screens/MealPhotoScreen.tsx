import { FeatureScreen } from '@/shared/components/ui/FeatureScreen';
import { Card } from '@/shared/components/ui/Card';
import { ActionButton } from '@/shared/components/ui/ActionButton';
import { premium } from '@/shared/theme/premium';
import { useTheme } from '@/hooks/use-theme';
import { Camera } from 'lucide-react-native';
import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image as ImageIcon, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRouteParams } from '@/app/navigation/NavigationContext';
import { images } from '@/shared/constants/images';
import type { MealType } from '../types/nutrition';

export function MealPhotoScreen() {
  const { goBack, replace } = useNavigation();
  const params = useRouteParams<{ meal?: MealType }>();
  const meal = params.meal ?? 'lunch';
  const { colors } = useTheme();
  const [opening, setOpening] = useState<'camera' | 'library' | null>(null);
  const openingRef = useRef(false);

  const takePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Camera Access Required',
          'Please enable camera permissions to take meal photos.',
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0]!;
        replace('mealAnalysis', {
          meal,
          imageUri: asset.uri,
          imageBase64: asset.base64 ?? '',
          mimeType: asset.mimeType ?? 'image/jpeg',
        });
      }
    } catch (err: any) {
      Alert.alert('Camera Error', err?.message || 'Could not open camera.');
    }
  };

  const pickFromGallery = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Gallery Access Required',
          'Please enable photo library permissions to select meal photos.',
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0]!;
        replace('mealAnalysis', {
          meal,
          imageUri: asset.uri,
          imageBase64: asset.base64 ?? '',
          mimeType: asset.mimeType ?? 'image/jpeg',
        });
      }
    } catch (err: any) {
      Alert.alert('Gallery Error', err?.message || 'Could not open gallery.');
    }
  };

  const open = async (source: 'camera' | 'library') => {
    if (openingRef.current) return;
    openingRef.current = true;
    setOpening(source);
    try {
      await (source === 'camera' ? takePhoto() : pickFromGallery());
    } finally {
      openingRef.current = false;
      setOpening(null);
    }
  };
  return (
    <FeatureScreen title="Meal photo">
      <View style={styles.content}>
        <Card appearance="premium" tone="muted" style={styles.guide}>
          <Camera size={44} color={colors.accentStrong} strokeWidth={1.5} />
          <Text style={[premium.type.title, { color: colors.ink }]}>
            The whole plate. One photo.
          </Text>
          <Text style={[premium.type.body, { color: colors.muted }]}>
            Use good light and keep the full meal in view. You’ll review the foods and portions
            before saving anything.
          </Text>
        </Card>
        <ActionButton
          title="Take a meal photo"
          icon={Camera}
          loading={opening === 'camera'}
          disabled={opening !== null}
          onPress={() => {
            void open('camera');
          }}
        />
        <ActionButton
          title="Choose from photo library"
          icon={ImageIcon}
          variant="secondary"
          loading={opening === 'library'}
          disabled={opening !== null}
          onPress={() => {
            void open('library');
          }}
        />
        <Text style={[premium.type.caption, { color: colors.muted }]}>
          AI nutrition values are estimates. Nothing is logged until you review and confirm.
        </Text>
      </View>
    </FeatureScreen>
  );
}
const styles = StyleSheet.create({
  content: { gap: 16, paddingBottom: 24 },
  guide: { gap: 20, paddingVertical: 32 },
});
