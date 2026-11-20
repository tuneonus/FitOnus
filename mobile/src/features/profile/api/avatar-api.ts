import { apiClient } from '@/services/api-client';
import { apiUploadTransport } from '@/shared/media/api-upload-client';
import { uploadImage, type PickedImage } from '@/shared/media/upload-image';
import type { AvatarResponse } from '../types/avatar';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export const avatarApi = {
  get: async (): Promise<AvatarResponse> => {
    const response = await apiClient.get<ApiResponse<AvatarResponse>>('/profile/avatar');
    return response.data.data;
  },

  /** Replaces the profile picture. The picture is sent as the raw request body; the server crops, converts and strips it. */
  upload: (
    image: PickedImage,
    options: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
  ): Promise<AvatarResponse> =>
    uploadImage<AvatarResponse>({
      transport: apiUploadTransport,
      method: 'PUT',
      path: '/profile/avatar',
      image,
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    }),

  remove: async (): Promise<AvatarResponse> => {
    const response = await apiClient.delete<ApiResponse<AvatarResponse>>('/profile/avatar');
    return response.data.data;
  },
};
