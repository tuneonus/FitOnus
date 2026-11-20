import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Camera, ImageIcon, Trash2 } from 'lucide-react-native';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { ListGroup, ListRow } from '@/shared/components/ui/ListRow';
import { ProgressBar } from '@/shared/components/ui/ProgressBar';
import { StatusBanner } from '@/shared/components/ui/StatusBanner';
import { Button } from '@/shared/components/ui/Button';
import { useTheme } from '@/hooks/use-theme';
import { openPhoneSettings, pickImage, type ImageSource } from '@/shared/media/pick-image';
import { useAvatar, useAvatarActions } from '../hooks/use-avatar';

export interface AvatarEditorSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Change the profile picture: take a photo or choose one (cropped to a square by the system editor), or remove it. Shows
 * upload progress, and every failure as a message with a way forward. While an upload runs the sheet stays open and the
 * choices are disabled, so a second upload cannot start.
 */
export function AvatarEditorSheet({ open, onClose }: AvatarEditorSheetProps) {
  const { colors } = useTheme();
  const { data } = useAvatar();
  const actions = useAvatarActions();
  const [denied, setDenied] = useState<{ message: string; canOpenSettings: boolean } | null>(null);
  const hasAvatar = Boolean(data?.avatar);
  const uploading = actions.state.phase === 'uploading';

  const choose = async (source: ImageSource) => {
    if (actions.isBusy) return;
    setDenied(null);
    actions.dismissError();
    const result = await pickImage(source, { squareCrop: true });
    if (result.status === 'denied') {
      setDenied({ message: result.message, canOpenSettings: result.canOpenSettings });
      return;
    }
    if (result.status !== 'picked') return;
    try {
      await actions.upload(result.image);
      onClose();
    } catch {
      // The hook turned the failure into a message that is shown below; the sheet stays open to retry.
    }
  };

  const remove = async () => {
    if (actions.isBusy) return;
    try {
      await actions.remove();
      onClose();
    } catch {
      // Message shown below.
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        if (uploading) actions.cancel();
        setDenied(null);
        actions.dismissError();
        onClose();
      }}
      title="Profile picture"
      description="Only you can see it."
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
        {actions.state.phase === 'error' ? (
          <StatusBanner tone="error" title="Could not update your picture" body={actions.state.message} />
        ) : null}

        {uploading ? (
          <View style={styles.progress} accessibilityLiveRegion="polite">
            <Text style={[styles.progressText, { color: colors.muted }]}>
              Uploading… {Math.round((actions.state.phase === 'uploading' ? actions.state.progress : 0) * 100)}%
            </Text>
            <ProgressBar
              value={actions.state.phase === 'uploading' ? actions.state.progress : 0}
              accessibilityLabel="Upload progress"
            />
            <Button title="Cancel" variant="ghost" onPress={actions.cancel} />
          </View>
        ) : (
          <ListGroup>
            <ListRow
              icon={Camera}
              title="Take photo"
              onPress={() => void choose('camera')}
            />
            <ListRow
              icon={ImageIcon}
              title="Choose from library"
              onPress={() => void choose('library')}
            />
            {hasAvatar ? (
              <ListRow
                icon={Trash2}
                title="Remove photo"
                destructive
                onPress={() => void remove()}
              />
            ) : null}
          </ListGroup>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12, paddingBottom: 8 },
  progress: { gap: 10 },
  progressText: { fontSize: 14, textAlign: 'center' },
});
