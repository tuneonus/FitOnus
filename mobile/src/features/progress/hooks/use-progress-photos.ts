import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { earliestExpiry, isUrlStale, refreshDelayMs } from '@/shared/media/private-image';
import { describeUploadError } from '@/shared/media/upload-image';
import { progressPhotosApi, type AddPhotoInput } from '../api/progress-photos-api';
import type { ProgressPhotoGallery } from '../types/progress-photos';

/** Keyed by member, so one account's photos are never shown under another's. */
export const progressPhotosKey = (userId: string | undefined) => ['progress', 'photos', userId ?? 'anonymous'] as const;
export const progressPhotoKey = (userId: string | undefined, id: string) =>
  ['progress', 'photo', userId ?? 'anonymous', id] as const;

/**
 * The member's gallery (thumbnails). The signed URLs expire, so the query refreshes itself a minute before the earliest
 * one does, and on mount when they are about to; otherwise it is not asked for again. Nothing is persisted.
 */
export function useProgressPhotos() {
  const userId = useAuthStore((state) => state.user?.id);
  const expiry = (data: ProgressPhotoGallery | undefined) => earliestExpiry(data?.photos.map((p) => p.urlExpiresAt) ?? []);
  return useQuery({
    queryKey: progressPhotosKey(userId),
    queryFn: progressPhotosApi.list,
    enabled: Boolean(userId),
    staleTime: 2 * 60_000,
    refetchOnMount: (query) => (isUrlStale(expiry(query.state.data)) ? 'always' : false),
    refetchInterval: (query) => refreshDelayMs(expiry(query.state.data)),
  });
}

/** One photo with its full-size URL, refreshed before the URL expires. */
export function useProgressPhoto(id: string | undefined) {
  const userId = useAuthStore((state) => state.user?.id);
  return useQuery({
    queryKey: progressPhotoKey(userId, id ?? ''),
    queryFn: () => progressPhotosApi.get(id!),
    enabled: Boolean(userId && id),
    staleTime: 2 * 60_000,
    refetchOnMount: (query) => (isUrlStale(query.state.data?.urlExpiresAt) ? 'always' : false),
    refetchInterval: (query) => refreshDelayMs(query.state.data?.urlExpiresAt),
  });
}

export type AddPhotoState =
  | { phase: 'idle' }
  | { phase: 'uploading'; progress: number }
  | { phase: 'error'; message: string; retryable: boolean; code: string | null };

/** Add a photo with upload progress and a message for every failure (including the 50-photo limit). */
export function useAddProgressPhoto() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);
  const [state, setState] = useState<AddPhotoState>({ phase: 'idle' });
  const controller = useRef<AbortController | null>(null);

  const mutation = useMutation({
    mutationFn: (input: AddPhotoInput) => {
      controller.current = new AbortController();
      setState({ phase: 'uploading', progress: 0 });
      return progressPhotosApi.add(input, {
        signal: controller.current.signal,
        onProgress: (progress) => setState({ phase: 'uploading', progress }),
      });
    },
    onSuccess: (result) => {
      queryClient.setQueryData(progressPhotoKey(userId, result.photo.id), result.photo);
      // The gallery is refetched (not patched): the server decides the order and returns every thumbnail URL fresh.
      void queryClient.invalidateQueries({ queryKey: progressPhotosKey(userId) });
      setState({ phase: 'idle' });
    },
    onError: (error) => {
      const { message, retryable, code } = describeUploadError(error);
      if (code === 'PHOTO_LIMIT_REACHED') void queryClient.invalidateQueries({ queryKey: progressPhotosKey(userId) });
      setState(code === 'CANCELLED' ? { phase: 'idle' } : { phase: 'error', message, retryable, code });
    },
    onSettled: () => {
      controller.current = null;
    },
  });

  return {
    state,
    isUploading: mutation.isPending,
    add: mutation.mutateAsync,
    cancel: () => controller.current?.abort(),
    dismissError: useCallback(() => setState({ phase: 'idle' }), []),
  };
}

/** Delete a photo for good. The gallery updates at once and is put back if the server refuses. */
export function useDeleteProgressPhoto() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);
  return useMutation({
    mutationFn: (id: string) => progressPhotosApi.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: progressPhotosKey(userId) });
      const previous = queryClient.getQueryData<ProgressPhotoGallery>(progressPhotosKey(userId));
      if (previous) {
        const photos = previous.photos.filter((photo) => photo.id !== id);
        queryClient.setQueryData<ProgressPhotoGallery>(progressPhotosKey(userId), {
          ...previous,
          photos,
          count: photos.length,
          nearLimit: photos.length >= previous.limit - 5,
        });
      }
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(progressPhotosKey(userId), context.previous);
    },
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: progressPhotoKey(userId, id) });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: progressPhotosKey(userId) });
    },
  });
}
