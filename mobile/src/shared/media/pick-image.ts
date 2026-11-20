import { Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { PickedImage } from './upload-image';
import { dayFromExifDate } from './exif-date';

export type ImageSource = 'camera' | 'library';

export type PickResult =
  | { status: 'picked'; image: PickedImageWithDay }
  | { status: 'cancelled' }
  | { status: 'denied'; message: string; canOpenSettings: boolean }
  | { status: 'error'; message: string };

export interface PickOptions {
  /** Let the member crop to a square before it is uploaded (profile picture). */
  squareCrop?: boolean;
  /** Also read the day the picture was taken from its EXIF (to suggest a date). The server removes EXIF from what it stores. */
  readTakenOn?: boolean;
}

/** A picked picture, plus the day it was taken when `readTakenOn` was asked for and the phone provides one. */
export type PickedImageWithDay = PickedImage & { takenOn?: string | null };

/**
 * Opens the camera or the photo library and returns the chosen picture.
 *
 * - The library needs no permission: the system picker (Android photo picker, iOS PHPicker) hands over only what the
 *   member selects, so the app never asks for access to all their photos.
 * - The camera asks for permission; a refusal is explained and, when the system allows, a shortcut to settings is offered.
 * - The picture is not processed here: the server converts it (resize, WebP, all metadata removed).
 */
export async function pickImage(source: ImageSource, options: PickOptions = {}): Promise<PickResult> {
  try {
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        return {
          status: 'denied',
          message: 'Camera access is off. Turn it on in your phone settings to take a photo.',
          canOpenSettings: permission.canAskAgain === false,
        };
      }
    }
    const pickerOptions: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 0.9,
      allowsMultipleSelection: false,
      // iOS 14+: hand over a JPEG instead of the original HEIC. The server accepts HEIC, but decoding it costs several
      // seconds and a lot of memory per photo; a JPEG avoids that and works whether or not the server has HEIC enabled.
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      ...(options.readTakenOn ? { exif: true } : {}),
      ...(options.squareCrop ? { allowsEditing: true, aspect: [1, 1] as [number, number] } : { allowsEditing: false }),
    };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(pickerOptions)
        : await ImagePicker.launchImageLibraryAsync(pickerOptions);
    if (result.canceled || !result.assets?.[0]) return { status: 'cancelled' };
    const asset = result.assets[0];
    return {
      status: 'picked',
      image: {
        uri: asset.uri,
        mimeType: asset.mimeType ?? null,
        fileSize: asset.fileSize ?? null,
        ...(options.readTakenOn
          ? { takenOn: dayFromExifDate(asset.exif?.['DateTimeOriginal'] ?? asset.exif?.['DateTime']) }
          : {}),
      },
    };
  } catch {
    return { status: 'error', message: source === 'camera' ? 'Could not open the camera.' : 'Could not open your photos.' };
  }
}

export const openPhoneSettings = (): void => {
  void Linking.openSettings();
};
