import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ImageOff, Check } from 'lucide-react-native';
import { PrivateImage } from '@/shared/media/PrivateImage';
import { privateImageCacheKey } from '@/shared/media/private-image';
import { useTheme } from '@/hooks/use-theme';
import { premium } from '@/shared/theme/premium';
import { TAG_LABELS, formatTakenOn } from '../utils/photo-gallery';
import type { ProgressPhotoItem } from '../types/progress-photos';

export interface PhotoTileProps {
  photo: ProgressPhotoItem;
  userId: string;
  width: number;
  /** In compare mode: 1 or 2 when chosen (the order they were picked in), else null. */
  selectionNumber: number | null;
  comparing: boolean;
  onPress: () => void;
  onNeedsFreshUrl: () => void;
}

/** One thumbnail in the gallery: 3:4, with its date and tag, and a number badge while choosing photos to compare. */
export function PhotoTile({ photo, userId, width, selectionNumber, comparing, onPress, onNeedsFreshUrl }: PhotoTileProps) {
  const { colors } = useTheme();
  const height = Math.round((width * 4) / 3);
  const selected = selectionNumber !== null;
  const label = `${formatTakenOn(photo.takenOn)}${photo.tag ? `, ${TAG_LABELS[photo.tag]}` : ''}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={comparing ? `${label}. ${selected ? 'Selected' : 'Not selected'}` : label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.75 : 1 }]}
    >
      <View
        style={[
          styles.frame,
          { width, height, backgroundColor: colors.surface2, borderColor: selected ? colors.accentStrong : colors.line },
          selected && styles.frameSelected,
        ]}
      >
        <PrivateImage
          uri={photo.thumbnailUrl}
          cacheKey={privateImageCacheKey('progress', userId, `${photo.id}:${photo.version}`, 'thumb')}
          style={{ width, height }}
          onNeedsFreshUrl={onNeedsFreshUrl}
          fallback={
            <View style={[styles.unavailable, { width, height }]} accessibilityLabel="Photo unavailable">
              <ImageOff size={22} color={colors.muted} />
              <Text style={[premium.type.caption, { color: colors.muted }]}>Unavailable</Text>
            </View>
          }
        />
        {photo.tag ? (
          <View style={[styles.tag, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
            <Text style={styles.tagText}>{TAG_LABELS[photo.tag]}</Text>
          </View>
        ) : null}
        {comparing ? (
          <View
            style={[
              styles.check,
              { backgroundColor: selected ? colors.accentStrong : 'rgba(0,0,0,0.35)', borderColor: colors.bg },
            ]}
          >
            {selected ? <Check size={14} color={colors.bg} /> : null}
          </View>
        ) : null}
      </View>
      <Text style={[premium.type.caption, styles.date, { color: colors.muted }]} numberOfLines={1}>
        {formatTakenOn(photo.takenOn)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: premium.radius.control, borderWidth: 1, overflow: 'hidden' },
  frameSelected: { borderWidth: 2 },
  unavailable: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  tag: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    borderRadius: premium.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tagText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  date: { marginTop: 4 },
});
