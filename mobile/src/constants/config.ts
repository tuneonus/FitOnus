// Render DEV is the default for both Expo Go and development builds.
// An explicit environment URL is respected without deriving a backend from the Metro host.
const DEV_API_URL = 'https://fitonus-api-dev.onrender.com/api/v1';

function resolveApiBaseUrl(): string {
  return (process.env.EXPO_PUBLIC_API_URL || DEV_API_URL).replace(/\/+$/, '');
}

export const Config = {
  API_BASE_URL: resolveApiBaseUrl(),
  IS_DEV: typeof __DEV__ !== 'undefined' ? __DEV__ : true,
  APP_VERSION: '1.0.0',
};
