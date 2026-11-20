'use client';

import React from 'react';
import { ImageUploadField } from '../../media/components/ImageUploadField';
import { NOTIFICATION_UNCONFIGURED_ADVICE } from '../../media/image-upload';
import { notificationsApi } from '../api';
import type { ComposerImage } from '../logic';

interface NotificationImageFieldProps {
  value: ComposerImage | null;
  onChange: (image: ComposerImage | null) => void;
  /** Lets the composer hold its Save / Review buttons while a file is still uploading. */
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}

/**
 * Optional image for an Android push notification: choose, preview, replace or remove. The behaviour is the shared
 * `ImageUploadField`; this adds what belongs to notifications: where the file goes and what the admin is told.
 */
export function NotificationImageField({ value, onChange, onBusyChange, disabled = false }: NotificationImageFieldProps) {
  return (
    <ImageUploadField
      value={value}
      onChange={onChange}
      onBusyChange={onBusyChange}
      disabled={disabled}
      upload={notificationsApi.uploadImage}
      unconfiguredAdvice={NOTIFICATION_UNCONFIGURED_ADVICE}
      previewAlt="Preview of the notification image"
      hint="Shown on Android only for now. Uploaded images are public: only use artwork that anyone may see, never a member’s photo."
    />
  );
}
