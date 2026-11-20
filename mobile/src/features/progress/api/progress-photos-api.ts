import { apiClient } from '@/services/api-client';
import { apiUploadTransport } from '@/shared/media/api-upload-client';
import { uploadImage, type PickedImage } from '@/shared/media/upload-image';
import type {
  ProgressPhotoDeleteResult,
  ProgressPhotoDetail,
  ProgressPhotoGallery,
  ProgressPhotoTag,
  ProgressPhotoUploadResult,
} from '../types/progress-photos';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface AddPhotoInput {
  image: PickedImage;
  /** `YYYY-MM-DD`: the member's own calendar day. */
  takenOn: string;
  tag?: ProgressPhotoTag | undefined;
}

export const progressPhotosApi = {
  list: async (): Promise<ProgressPhotoGallery> => {
    const response = await apiClient.get<ApiResponse<ProgressPhotoGallery>>('/progress/photos');
    return response.data.data;
  },

  /** One photo with its full-size picture URL. Someone else's id is a 404, like an id that does not exist. */
  get: async (id: string): Promise<ProgressPhotoDetail> => {
    const response = await apiClient.get<ApiResponse<ProgressPhotoDetail>>(`/progress/photos/${encodeURIComponent(id)}`);
    return response.data.data;
  },

  /** The picture is the raw request body; the date and tag travel in the query string. */
  add: (
    input: AddPhotoInput,
    options: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
  ): Promise<ProgressPhotoUploadResult> =>
    uploadImage<ProgressPhotoUploadResult>({
      transport: apiUploadTransport,
      method: 'POST',
      path: '/progress/photos',
      query: { takenOn: input.takenOn, tag: input.tag },
      image: input.image,
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    }),

  delete: async (id: string): Promise<ProgressPhotoDeleteResult> => {
    const response = await apiClient.delete<ApiResponse<ProgressPhotoDeleteResult>>(
      `/progress/photos/${encodeURIComponent(id)}`,
    );
    return response.data.data;
  },
};
