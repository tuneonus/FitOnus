import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { isUrlStale, refreshDelayMs } from '@/shared/media/private-image';
import { describeUploadError, type PickedImage } from '@/shared/media/upload-image';
import { avatarApi } from '../api/avatar-api';
import type { AvatarResponse } from '../types/avatar';

/** Keyed by member, so one account's picture is never shown under another's. */
export const avatarQueryKey = (userId: string | undefined) => ['profile', 'avatar', userId ?? 'anonymous'] as const;

/**
 * The signed-in member's profile picture. The signed URLs expire, so the query refreshes itself a minute before they
 * do, and again on mount when they are about to; in between it is not asked for again. Nothing here is persisted: the
 * query cache lives in memory and is cleared on sign-out.
 */
export function useAvatar() {
  const userId = useAuthStore((state) => state.user?.id);
  return useQuery({
    queryKey: avatarQueryKey(userId),
    queryFn: avatarApi.get,
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    refetchOnMount: (query) => (isUrlStale(query.state.data?.avatar?.expiresAt) ? 'always' : false),
    refetchInterval: (query) => refreshDelayMs(query.state.data?.avatar?.expiresAt),
  });
}

export type AvatarUploadState =
  | { phase: 'idle' }
  | { phase: 'uploading'; progress: number }
  | { phase: 'error'; message: string; retryable: boolean };

/** Set or remove the picture, with upload progress and a message for every failure. */
export function useAvatarActions() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);
  const [state, setState] = useState<AvatarUploadState>({ phase: 'idle' });
  const controller = useRef<AbortController | null>(null);

  const publish = useCallback(
    (response: AvatarResponse) => queryClient.setQueryData(avatarQueryKey(userId), response),
    [queryClient, userId],
  );

  const upload = useMutation({
    mutationFn: (image: PickedImage) => {
      controller.current = new AbortController();
      setState({ phase: 'uploading', progress: 0 });
      return avatarApi.upload(image, {
        signal: controller.current.signal,
        onProgress: (progress) => setState({ phase: 'uploading', progress }),
      });
    },
    onSuccess: (response) => {
      publish(response); // the new version replaces the old one everywhere at once
      setState({ phase: 'idle' });
    },
    onError: (error) => {
      const { message, retryable, code } = describeUploadError(error);
      setState(code === 'CANCELLED' ? { phase: 'idle' } : { phase: 'error', message, retryable });
    },
    onSettled: () => {
      controller.current = null;
    },
  });

  const remove = useMutation({
    mutationFn: () => avatarApi.remove(),
    onSuccess: (response) => {
      publish(response);
      setState({ phase: 'idle' });
    },
    onError: (error) => {
      const { message, retryable } = describeUploadError(error);
      setState({ phase: 'error', message, retryable });
    },
  });

  return {
    state,
    isBusy: upload.isPending || remove.isPending,
    upload: upload.mutateAsync,
    remove: remove.mutateAsync,
    cancel: () => controller.current?.abort(),
    dismissError: () => setState({ phase: 'idle' }),
  };
}
