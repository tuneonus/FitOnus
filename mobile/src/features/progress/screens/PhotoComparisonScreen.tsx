import React, { useState } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { ArrowLeftRight, ImageOff } from 'lucide-react-native';
import { useNavigation, useRouteParams } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { Button } from '@/shared/components/ui/Button';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useTheme } from '@/hooks/use-theme';
import { premium } from '@/shared/theme/premium';
import { PrivateImage } from '@/shared/media/PrivateImage';
import { privateImageCacheKey } from '@/shared/media/private-image';
import { useProgressPhoto } from '../hooks/use-progress-photos';
import { TAG_LABELS, daysBetween, formatTakenOn } from '../utils/photo-gallery';

const GAP = 12;

function Side({ label, id, width, userId }: { label: 'Before' | 'After'; id: string; width: number; userId: string }) {
  const { colors } = useTheme();
  const query = useProgressPhoto(id);
  const photo = query.data;
  const height = Math.round((width * 4) / 3);

  return (
    <View style={{ width, gap: 8 }}>
      <Text style={[premium.type.eyebrow, { color: colors.muted }]}>{label.toUpperCase()}</Text>
      <View style={[styles.frame, { width, height, backgroundColor: colors.surface2 }]}>
        {query.isPending ? (
          <Skeleton width={width} height={height} radius={premium.radius.card} />
        ) : photo ? (
          <PrivateImage
            uri={photo.url}
            cacheKey={privateImageCacheKey('progress', userId, `${photo.id}:${photo.version}`, 'full')}
            style={{ width, height }}
            onNeedsFreshUrl={() => void query.refetch()}
            accessibilityLabel={`${label} photo, ${formatTakenOn(photo.takenOn)}`}
            fallback={<Unavailable width={width} height={height} onRetry={() => void query.refetch()} />}
          />
        ) : (
          <Unavailable width={width} height={height} onRetry={() => void query.refetch()} />
        )}
      </View>
      {photo ? (
        <View>
          <Text style={[premium.type.cardTitle, { color: colors.ink }]}>{formatTakenOn(photo.takenOn)}</Text>
          {photo.tag ? <Text style={[premium.type.caption, { color: colors.muted }]}>{TAG_LABELS[photo.tag]}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function Unavailable({ width, height, onRetry }: { width: number; height: number; onRetry: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.unavailable, { width, height }]}>
      <ImageOff size={24} color={colors.muted} />
      <Button title="Retry" variant="ghost" size="sm" onPress={onRetry} />
    </View>
  );
}

/** Two of the member's photos side by side, earlier on the left, with the time between them. */
export function PhotoComparisonScreen() {
  const { colors } = useTheme();
  const { goBack } = useNavigation();
  const params = useRouteParams<{ before?: string; after?: string }>();
  const { width } = useWindowDimensions();
  const userId = useAuthStore((state) => state.user?.id) ?? '';
  const [swapped, setSwapped] = useState(false);

  const left = swapped ? params.after : params.before;
  const right = swapped ? params.before : params.after;
  const beforePhoto = useProgressPhoto(params.before).data;
  const afterPhoto = useProgressPhoto(params.after).data;
  const sideWidth = Math.floor((Math.min(width, premium.layout.maxWidth) - premium.layout.gutter * 2 - GAP) / 2);
  const days = beforePhoto && afterPhoto ? Math.abs(daysBetween(beforePhoto.takenOn, afterPhoto.takenOn)) : null;

  if (!left || !right) {
    return (
      <Screen title="Compare photos" showBack>
        <EmptyState icon={ImageOff} title="Choose two photos" body="Go back and pick two photos to compare." actionLabel="Go back" onAction={goBack} />
      </Screen>
    );
  }

  return (
    <Screen title="Compare photos" showBack contentContainerStyle={styles.container}>
      <View style={styles.row}>
        <Side label={swapped ? 'After' : 'Before'} id={left} width={sideWidth} userId={userId} />
        <Side label={swapped ? 'Before' : 'After'} id={right} width={sideWidth} userId={userId} />
      </View>
      {days !== null ? (
        <View style={[styles.summary, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[premium.type.metricSm, { color: colors.ink }]}>{days === 0 ? 'Same day' : `${days} day${days === 1 ? '' : 's'}`}</Text>
          <Text style={[premium.type.caption, { color: colors.muted }]}>between these photos</Text>
        </View>
      ) : null}
      <Button title="Swap sides" icon={ArrowLeftRight} variant="outline" onPress={() => setSwapped((value) => !value)} fullWidth />
      <Button title="Choose other photos" variant="ghost" onPress={goBack} fullWidth />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 32, gap: 16 },
  row: { flexDirection: 'row', gap: GAP },
  frame: { borderRadius: premium.radius.card, overflow: 'hidden' },
  unavailable: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  summary: { borderWidth: 1, borderRadius: premium.radius.card, padding: 16, alignItems: 'center', gap: 2 },
});
