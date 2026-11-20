'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import { ImageOff, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import {
  IMAGE_ACCEPT,
  canPreviewInBrowser,
  imageUploadSummary,
  resolveImageType,
  uploadImageFile,
  type UploadedImageRef,
} from '../image-upload';

export interface ImageUploadFieldProps {
  value: UploadedImageRef | null;
  onChange: (image: UploadedImageRef | null) => void;
  /** Lets the form hold its Save button while a file is still uploading. */
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
  /** Uploads one file with the given Content-Type (the backend stores it and answers with a key and a URL). */
  upload: (file: Blob, contentType: string) => Promise<{ imageKey: string; imageUrl: string }>;
  /** What the admin can do instead when the server has no image storage. */
  unconfiguredAdvice?: string;
  /** Label above the field. */
  label?: string;
  optional?: boolean;
  /** Alt text of the preview. */
  previewAlt: string;
  /** Said after the shared "formats, size, converted to WebP" sentence. */
  hint: React.ReactNode;
}

/**
 * Optional image for a record: choose, preview, replace or remove. Used by notifications and exercises.
 *
 * The file goes to the backend, which checks it, converts it and stores it; this component only ever holds the
 * returned key and public URL. No storage credential exists in the browser. Choosing a file never changes the record
 * until the upload has succeeded, so a failed replacement keeps the previous image.
 */
export function ImageUploadField({
  value,
  onChange,
  onBusyChange,
  disabled = false,
  upload: uploadFile,
  unconfiguredAdvice,
  label = 'Image',
  optional = true,
  previewAlt,
  hint,
}: ImageUploadFieldProps) {
  const labelId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The just-chosen file shown straight from memory, so the preview works even before the public URL is reachable.
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  // A synchronous lock: two quick picks must not start two uploads (state alone updates on the next render).
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const localUrlRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    };
  }, []);

  const replaceLocalPreview = (next: string | null) => {
    if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    localUrlRef.current = next;
    setLocalPreview(next);
    setPreviewFailed(false);
  };

  const pick = () => {
    if (!busyRef.current) inputRef.current?.click();
  };

  const upload = async (file: File) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setError(null);
    setUploading(true);
    onBusyChange?.(true);
    try {
      const outcome = await uploadImageFile(file, uploadFile, unconfiguredAdvice);
      if (!mountedRef.current) return;
      if (outcome.ok) {
        // Most browsers cannot draw a HEIC photo, so for one the preview comes from the converted WebP the server
        // stored (the key's public URL) instead of from the chosen file.
        const type = resolveImageType(file);
        replaceLocalPreview(type && canPreviewInBrowser(type) ? URL.createObjectURL(file) : null);
        onChange(outcome.image);
      } else {
        // A failed pick leaves the current image exactly as it was.
        setError(outcome.error);
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setUploading(false);
      onBusyChange?.(false);
    }
  };

  const remove = () => {
    if (busyRef.current) return;
    replaceLocalPreview(null);
    setError(null);
    onChange(null);
  };

  const shown = localPreview ?? value?.url ?? null;
  const locked = disabled || uploading;

  return (
    <div>
      <p id={labelId} className="field-label">
        {label} {optional && <span className="font-normal text-ink-400">(optional)</span>}
      </p>

      {value ? (
        <div className="card-inset space-y-3 p-3">
          <div className="relative flex h-36 w-full items-center justify-center overflow-hidden rounded-md bg-ink-950">
            {shown && !previewFailed ? (
              <Image
                src={shown}
                alt={previewAlt}
                fill
                unoptimized
                sizes="(min-width: 1024px) 24rem, 100vw"
                className="object-contain"
                onError={() => setPreviewFailed(true)}
              />
            ) : (
              <p className="flex items-center gap-2 px-4 text-center text-xs text-ink-300">
                <ImageOff className="h-4 w-4 shrink-0" aria-hidden="true" />
                {previewFailed
                  ? 'The image was saved, but this preview could not be loaded.'
                  : 'The image was saved. No preview is available.'}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-secondary btn-sm" onClick={pick} disabled={locked}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              {uploading ? 'Uploading…' : 'Replace image'}
            </button>
            <button type="button" className="btn btn-danger-ghost btn-sm" onClick={remove} disabled={locked}>
              <Trash2 className="h-4 w-4" />
              Remove image
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary" onClick={pick} disabled={locked}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          {uploading ? 'Uploading…' : 'Add image'}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        tabIndex={-1}
        aria-labelledby={labelId}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so choosing the same file again (after removing it) still fires a change.
          event.target.value = '';
          if (file) void upload(file);
        }}
      />

      <p aria-live="polite" className="sr-only">{uploading ? 'Uploading image' : ''}</p>
      {error ? (
        <p role="alert" className="field-error">{error}</p>
      ) : (
        <p className="field-hint">
          {imageUploadSummary()} {hint}
        </p>
      )}
    </div>
  );
}
