let Constants: any = null;
try {
  Constants = require('expo-constants');
} catch {
  // Headless test or non-Expo environment
}

function resolveApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl;
  }

  // Derive host IP when running in Expo Go on a physical device
  const hostUri = Constants?.default?.expoConfig?.hostUri || Constants?.expoConfig?.hostUri;
  if (hostUri) {
    const hostIp = hostUri.split(':')[0];
    if (hostIp) {
      return `http://${hostIp}:3000/api/v1`;
    }
  }

  return envUrl || 'http://localhost:3000/api/v1';
}

export const Config = {
  API_BASE_URL: resolveApiBaseUrl(),
  IS_DEV: typeof __DEV__ !== 'undefined' ? __DEV__ : true,
  APP_VERSION: '1.0.0',
};
