import React, { useState } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { ImageOff, Trash2 } from 'lucide-react-native';
import { useNavigation, useRouteParams } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { ConfirmDialog } from '@/shared/components/ui/ConfirmDialog';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { StatusBanner } from '@/shared/components/ui/StatusBanner';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useTheme } from '@/hooks/use-theme';
import { premium } from '@/shared/theme/premium';
import { PrivateImage } from '@/shared/media/PrivateImage';
import { privateImageCacheKey } from '@/shared/media/private-image';
import { describeUploadError } from '@/shared/media/upload-image';
import { useDeleteProgressPhoto, useProgressPhoto } from '../hooks/use-progress-photos';
import { TAG_LABELS, formatTakenOn } from '../utils/photo-gallery';

/** One photo at full size, with its date and view, and a confirmed delete. */
export function ProgressPhotoViewerScreen() {
  const { colors } = useTheme();
  const { goBack } = useNavigation();
  const { id } = useRouteParams<{ id?: string }>();
  const { width } = useWindowDimensions();
  const userId = useAuthStore((state) => state.user?.id) ?? '';
  const query = useProgressPhoto(id);
  const remove = useDeleteProgressPhoto();
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const photo = query.data;
  const frameWidth = Math.min(width, premium.layout.maxWidth) - premium.layout.gutter * 2;
  const frameHeight = photo ? Math.round(frameWidth * Math.min(photo.height / photo.width, 1.6)) : Math.round((frameWidth * 4) / 3);

  const confirmDelete = async () => {
    if (!photo) return;
    setConfirming(false);
    setDeleteError(null);
    try {
      await remove.mutateAsync(photo.id);
      goBack();
    } catch (error) {
      setDeleteError(describeUploadError(error).message.replace('upload', 'delete'));
    }
  };

  return (
    <Screen title={photo ? formatTakenOn(photo.takenOn) : 'Photo'} showBack contentContainerStyle={styles.container}>
      {query.isPending ? (
        <Skeleton width={frameWidth} height={frameHeight} radius={premium.radius.card} />
      ) : query.isError || !photo ? (
        <EmptyState
          icon={ImageOff}
          title="Photo not available"
          body="It may have been deleted, or could not be loaded."
          actionLabel="Go back"
          onAction={goBack}
        />
      ) : (
        <>
          <View style={[styles.frame, { width: frameWidth, height: frameHeight, backgroundColor: colors.surface2 }]}>
            <PrivateImage
              uri={photo.url}
              cacheKey={privateImageCacheKey('progress', userId, `${photo.id}:${photo.version}`, 'full')}
              style={{ width: frameWidth, height: frameHeight }}
              contentFit="contain"
              onNeedsFreshUrl={() => void query.refetch()}
              accessibilityLabel={`Progress photo from ${formatTakenOn(photo.takenOn)}`}
              fallback={
                <View style={[styles.unavailable, { width: frameWidth, height: frameHeight }]}>
                  <ImageOff size={28} color={colors.muted} />
                  <Text style={[premium.type.bodySm, { color: colors.muted }]}>This photo could not be loaded.</Text>
                  <Button title="Try again" variant="outline" size="sm" onPress={() => void query.refetch()} />
                </View>
              }
            />
          </View>
          <View style={styles.meta}>
            <Text style={[premium.type.cardTitle, { color: colors.ink }]}>{formatTakenOn(photo.takenOn)}</Text>
            {photo.tag ? <Badge tone="accent">{TAG_LABELS[photo.tag]}</Badge> : null}
          </View>
          {deleteError ? <StatusBanner tone="error" title="Could not delete the photo" body={deleteError} /> : null}
          <Button
            title="Delete photo"
            icon={Trash2}
            variant="danger"
            loading={remove.isPending}
            onPress={() => setConfirming(true)}
            fullWidth
          />
        </>
      )}
      <ConfirmDialog
        open={confirming}
        title="Delete this photo?"
        message="It will be permanently removed from your account and our storage. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirming(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 32, gap: 16 },
  frame: { borderRadius: premium.radius.card, overflow: 'hidden', alignSelf: 'center' },
  unavailable: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
