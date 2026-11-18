import { Linking, Alert } from 'react-native';

/**
 * Opens a URL in the device's default browser.
 * Shows a user-visible alert if the URL cannot be opened.
 */
export async function openUrl(url: string): Promise<void> {
  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert(
        'Cannot open link',
        'This link could not be opened on your device.',
        [{ text: 'OK' }],
      );
    }
  } catch {
    Alert.alert(
      'Cannot open link',
      'Something went wrong while opening the link. Please try again later.',
      [{ text: 'OK' }],
    );
  }
}

