import Constants from 'expo-constants';

function resolveApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;

  // Remote production or HTTPS staging URLs take absolute precedence
  if (envUrl && envUrl.startsWith('https://')) {
    return envUrl;
  }

  // Derive host IP when running in Expo Go on a physical device.
  // The device is guaranteed reachable via the host IP that served the JS bundle.
  const hostUri = Constants?.expoConfig?.hostUri || (Constants as any)?.manifest?.debuggerHost;
  if (hostUri) {
    const hostIp = hostUri.split(':')[0];
    if (hostIp && hostIp !== 'localhost' && hostIp !== '127.0.0.1') {
      return `http://${hostIp}:3000/api/v1`;
    }
  }

  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl;
  }

  return envUrl || 'http://localhost:3000/api/v1';
}

export const Config = {
  API_BASE_URL: resolveApiBaseUrl(),
  IS_DEV: typeof __DEV__ !== 'undefined' ? __DEV__ : true,
  APP_VERSION: '1.0.0',
};

