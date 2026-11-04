import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, SafeAreaView } from 'react-native';
import { Image as ImageIcon, X } from 'lucide-react-native';
import { useNavigation, useRouteParams } from '@/app/navigation/NavigationContext';
import { images } from '@/shared/constants/images';
import type { MealType } from '../types/nutrition';

export function MealPhotoScreen() {
  const { goBack, replace } = useNavigation();
  const params = useRouteParams<{ meal?: MealType }>();
  const meal = params.meal ?? 'lunch';

  const analyze = () => replace('mealAnalysis', { meal });

  return (
    <View style={styles.container}>
      <Image source={images.mealPhoto} style={styles.bgImage} resizeMode="cover" />
      <View style={styles.overlay} />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={goBack}
            style={styles.iconCircle}
            accessibilityLabel="Close camera"
          >
            <X size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.pillBanner}>
            <Text style={styles.pillText}>Fit the whole plate in frame</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        {/* Viewfinder frame */}
        <View style={styles.viewfinderWrapper}>
          <View style={styles.viewfinder} />
        </View>

        {/* Bottom controls */}
        <View style={styles.bottomControls}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={analyze}
            style={styles.galleryBtn}
            accessibilityLabel="Upload from photo library"
          >
            <ImageIcon size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={analyze}
            style={styles.shutterOuter}
            accessibilityLabel="Take photo"
          >
            <View style={styles.shutterInner} />
          </TouchableOpacity>

          <View style={styles.dummySpacer} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  bgImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
    opacity: 0.9,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillBanner: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  headerSpacer: {
    width: 44,
  },
  viewfinderWrapper: {
    flex: 1,
    marginHorizontal: 32,
    marginTop: 24,
    marginBottom: 16,
  },
  viewfinder: {
    flex: 1,
    borderRadius: 32,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255, 255, 255, 0.7)',
  },
  bottomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 36,
    paddingBottom: 32,
    paddingTop: 12,
  },
  galleryBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
  },
  dummySpacer: {
    width: 48,
  },
});
