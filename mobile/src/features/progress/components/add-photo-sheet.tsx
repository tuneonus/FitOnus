import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Camera, ImageIcon, Minus, Plus } from 'lucide-react-native';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { Button } from '@/shared/components/ui/Button';
import { Chip } from '@/shared/components/ui/Chip';
import { ListGroup, ListRow } from '@/shared/components/ui/ListRow';
import { ProgressBar } from '@/shared/components/ui/ProgressBar';
import { StatusBanner } from '@/shared/components/ui/StatusBanner';
import { useTheme } from '@/hooks/use-theme';
import { premium } from '@/shared/theme/premium';
import { openPhoneSettings, pickImage, type ImageSource } from '@/shared/media/pick-image';
import type { PickedImage } from '@/shared/media/upload-image';
import { useAddProgressPhoto } from '../hooks/use-progress-photos';
import { TAG_LABELS, TAG_ORDER, clampDay, formatTakenOn, localDayKey, shiftDay } from '../utils/photo-gallery';
import type { ProgressPhotoTag } from '../types/progress-photos';

export interface AddPhotoSheetProps {
  open: boolean;
  onClose: () => void;
}

interface Picked {
  image: PickedImage & { takenOn?: string | null };
}

/**
 * Add a progress photo in two steps: take or choose a picture, then confirm its day and (optionally) which view it shows
 * (front, side, back) and upload it. The day starts from the picture's own date when the phone provides one, else today,
 * and can be moved earlier but never past today. While uploading the sheet shows progress and can be cancelled; every
 * failure (including the 50-photo limit) is a message with a way forward.
 */
export function AddPhotoSheet({ open, onClose }: AddPhotoSheetProps) {
  const { colors } = useTheme();
  const upload = useAddProgressPhoto();
  const today = useMemo(() => localDayKey(), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [picked, setPicked] = useState<Picked | null>(null);
  const [day, setDay] = useState(today);
  const [tag, setTag] = useState<ProgressPhotoTag | undefined>(undefined);
  const [denied, setDenied] = useState<{ message: string; canOpenSettings: boolean } | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const uploading = upload.state.phase === 'uploading';

  useEffect(() => {
    if (open) return;
    setPicked(null);
    setTag(undefined);
    setDenied(null);
    setPickError(null);
    upload.dismissError();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = async (source: ImageSource) => {
    setDenied(null);
    setPickError(null);
    upload.dismissError();
    const result = await pickImage(source, { readTakenOn: true });
    if (result.status === 'denied') setDenied({ message: result.message, canOpenSettings: result.canOpenSettings });
    else if (result.status === 'error') setPickError(result.message);
    else if (result.status === 'picked') {
      setPicked({ image: result.image });
      setDay(clampDay(result.image.takenOn ?? today, today));
    }
  };

  const save = async () => {
    if (!picked || uploading) return;
    try {
      await upload.add({ image: picked.image, takenOn: day, tag });
      onClose();
    } catch {
      // The hook turned the failure into the message shown below; the sheet stays open to retry or change the choice.
    }
  };

  const close = () => {
    if (uploading) upload.cancel();
    onClose();
  };

  const error = upload.state.phase === 'error' ? upload.state : null;

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title="Add progress photo"
      description="Private: only you can see your photos."
    >
      <View style={styles.body}>
        {denied ? (
          <StatusBanner
            tone="warning"
            title="Camera access needed"
            body={denied.message}
            {...(denied.canOpenSettings ? { actionLabel: 'Open settings', onAction: openPhoneSettings } : {})}
          />
        ) : null}
        {pickError ? <StatusBanner tone="error" title="Could not open the photo" body={pickError} /> : null}
        {error ? <StatusBanner tone="error" title="Could not add your photo" body={error.message} /> : null}

        {!picked ? (
          <ListGroup>
            <ListRow icon={Camera} title="Take photo" onPress={() => void choose('camera')} />
            <ListRow icon={ImageIcon} title="Choose from library" onPress={() => void choose('library')} />
          </ListGroup>
        ) : (
          <>
            <View style={styles.previewRow}>
              <Image source={{ uri: picked.image.uri }} style={[styles.preview, { backgroundColor: colors.surface2 }]} contentFit="cover" />
              <View style={styles.previewMeta}>
                <Text style={[premium.type.caption, { color: colors.muted }]}>Taken on</Text>
                <Text style={[premium.type.cardTitle, { color: colors.ink }]}>{formatTakenOn(day)}</Text>
                <View style={styles.stepper}>
                  {[-7, -1, 1, 7].map((delta) => {
                    const next = clampDay(shiftDay(day, delta), today);
                    const disabled = uploading || next === day;
                    return (
                      <Pressable
                        key={delta}
                        accessibilityRole="button"
                        accessibilityLabel={`${delta < 0 ? 'Earlier' : 'Later'} by ${Math.abs(delta)} day${Math.abs(delta) === 1 ? '' : 's'}`}
                        disabled={disabled}
                        onPress={() => setDay(next)}
                        style={[styles.step, { backgroundColor: colors.surface2, opacity: disabled ? 0.35 : 1 }]}
                      >
                        {delta < 0 ? <Minus size={12} color={colors.ink} /> : <Plus size={12} color={colors.ink} />}
                        <Text style={[premium.type.caption, { color: colors.ink }]}>{Math.abs(delta)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>

            <View>
              <Text style={[premium.type.caption, { color: colors.muted, marginBottom: 8 }]}>View (optional)</Text>
              <View style={styles.chips}>
                {TAG_ORDER.map((option) => (
                  <Chip
                    key={option}
                    label={TAG_LABELS[option]}
                    selected={tag === option}
                    onPress={() => setTag(tag === option ? undefined : option)}
                  />
                ))}
              </View>
            </View>

            {uploading ? (
              <View style={styles.progress} accessibilityLiveRegion="polite">
                <Text style={[premium.type.bodySm, { color: colors.muted, textAlign: 'center' }]}>
                  Uploading… {Math.round(upload.state.phase === 'uploading' ? upload.state.progress * 100 : 0)}%
                </Text>
                <ProgressBar value={upload.state.phase === 'uploading' ? upload.state.progress : 0} accessibilityLabel="Upload progress" />
                <Button title="Cancel" variant="ghost" onPress={upload.cancel} />
              </View>
            ) : (
              <View style={styles.actions}>
                <Button title={error?.retryable ? 'Try again' : 'Save photo'} onPress={() => void save()} fullWidth />
                <Button title="Choose a different photo" variant="ghost" onPress={() => setPicked(null)} fullWidth />
              </View>
            )}
          </>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 14, paddingBottom: 8 },
  previewRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  preview: { width: 96, height: 128, borderRadius: premium.radius.control },
  previewMeta: { flex: 1, gap: 4 },
  stepper: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    height: 32,
    borderRadius: premium.radius.pill,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  progress: { gap: 10 },
  actions: { gap: 4 },
});
