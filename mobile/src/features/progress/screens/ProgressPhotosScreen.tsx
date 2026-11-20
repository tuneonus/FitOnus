import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, useWindowDimensions } from 'react-native';
import { Camera, Plus } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { Button } from '@/shared/components/ui/Button';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { IconButton } from '@/shared/components/ui/IconButton';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { StatusBanner } from '@/shared/components/ui/StatusBanner';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useTheme } from '@/hooks/use-theme';
import { premium } from '@/shared/theme/premium';
import { describeUploadError } from '@/shared/media/upload-image';
import { AddPhotoSheet } from '../components/add-photo-sheet';
import { PhotoTile } from '../components/photo-tile';
import { useProgressPhotos } from '../hooks/use-progress-photos';
import { defaultComparisonPair, groupPhotosByMonth, limitState, orderPair, togglePick } from '../utils/photo-gallery';

const COLUMNS = 3;
const GAP = 10;

/**
 * The member's private progress photos, newest first, grouped by month. Add a photo (camera or library), open one, or choose
 * two to compare side by side. Shows loading, error, empty and limit states; thumbnails refresh their own short-lived URLs.
 */
export function ProgressPhotosScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const { width } = useWindowDimensions();
  const userId = useAuthStore((state) => state.user?.id) ?? '';
  const query = useProgressPhotos();
  const [addOpen, setAddOpen] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const data = query.data;
  const limit = data ? limitState(data.count, data.limit, data.nearLimit) : null;
  const groups = data ? groupPhotosByMonth(data.photos) : [];
  const contentWidth = Math.min(width, premium.layout.maxWidth) - premium.layout.gutter * 2;
  const tileWidth = Math.floor((contentWidth - GAP * (COLUMNS - 1)) / COLUMNS);

  const refresh = useCallback(() => void query.refetch(), [query]);

  const stopComparing = () => {
    setComparing(false);
    setPicked([]);
  };

  const openPhoto = (id: string) => {
    if (comparing) setPicked((current) => togglePick(current, id));
    else navigate('progressPhoto', { id });
  };

  const compare = (ids: [string, string]) => {
    const photos = data?.photos ?? [];
    const a = photos.find((photo) => photo.id === ids[0]);
    const b = photos.find((photo) => photo.id === ids[1]);
    if (!a || !b) return;
    const { before, after } = orderPair(a, b);
    stopComparing();
    navigate('photoComparison', { before: before.id, after: after.id });
  };

  const quickPair = data ? defaultComparisonPair(data.photos) : null;

  return (
    <Screen
      title="Progress photos"
      showBack
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={refresh} tintColor={colors.accentStrong} />}
      headerRight={
        <IconButton
          icon={Plus}
          label="Add photo"
          accessibilityLabel="Add progress photo"
          onPress={() => setAddOpen(true)}
          disabled={limit ? !limit.canAdd : true}
        />
      }
      footer={
        comparing ? (
          <View style={[styles.footer, { backgroundColor: colors.bg, borderTopColor: colors.line }]}>
            <Button
              title={picked.length === 2 ? 'Compare these two' : `Choose ${2 - picked.length} more photo${picked.length === 1 ? '' : 's'}`}
              disabled={picked.length !== 2}
              onPress={() => picked.length === 2 && compare([picked[0]!, picked[1]!])}
              fullWidth
            />
          </View>
        ) : undefined
      }
      contentContainerStyle={styles.container}
    >
      {query.isPending ? (
        <View accessibilityLabel="Loading your photos" style={styles.grid}>
          {Array.from({ length: 9 }, (_, index) => (
            <Skeleton key={index} width={tileWidth} height={Math.round((tileWidth * 4) / 3)} radius={premium.radius.control} />
          ))}
        </View>
      ) : query.isError && !data ? (
        <StatusBanner
          tone="error"
          title="Could not load your photos"
          body={describeUploadError(query.error).message}
          actionLabel="Try again"
          onAction={refresh}
        />
      ) : data && data.photos.length === 0 ? (
        <EmptyState
          icon={Camera}
          title="No progress photos yet"
          body="Add a photo to see your change over time. Your photos are private: only you can see them."
          actionLabel="Add your first photo"
          onAction={() => setAddOpen(true)}
        />
      ) : data ? (
        <>
          {query.isError ? (
            <StatusBanner tone="warning" title="Showing your last loaded photos" actionLabel="Refresh" onAction={refresh} />
          ) : null}
          {limit?.banner ? <StatusBanner tone={limit.banner.tone} title={limit.banner.title} body={limit.banner.body} /> : null}

          {data.photos.length >= 2 ? (
            <View style={styles.actions}>
              <Button
                title={comparing ? 'Cancel' : 'Compare'}
                variant={comparing ? 'ghost' : 'outline'}
                size="sm"
                onPress={() => (comparing ? stopComparing() : setComparing(true))}
              />
              {!comparing && quickPair ? (
                <Button
                  title="Oldest vs newest"
                  variant="outline"
                  size="sm"
                  onPress={() => compare([quickPair.before.id, quickPair.after.id])}
                />
              ) : null}
              {comparing ? (
                <Text style={[premium.type.caption, { color: colors.muted }]}>Choose two photos</Text>
              ) : null}
            </View>
          ) : (
            <Text style={[premium.type.bodySm, { color: colors.muted }]}>Add one more photo to compare your progress.</Text>
          )}

          {groups.map((group) => (
            <View key={group.key} style={styles.section}>
              <Text accessibilityRole="header" style={[premium.type.heading, { color: colors.ink }]}>
                {group.label}
              </Text>
              <View style={styles.grid}>
                {group.photos.map((photo) => {
                  const index = picked.indexOf(photo.id);
                  return (
                    <PhotoTile
                      key={photo.id}
                      photo={photo}
                      userId={userId}
                      width={tileWidth}
                      comparing={comparing}
                      selectionNumber={index >= 0 ? index + 1 : null}
                      onPress={() => openPhoto(photo.id)}
                      onNeedsFreshUrl={refresh}
                    />
                  );
                })}
              </View>
            </View>
          ))}
        </>
      ) : null}

      <AddPhotoSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 32, gap: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  section: { gap: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  footer: { paddingHorizontal: premium.layout.gutter, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
