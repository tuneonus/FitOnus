const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__;

function resolveApiBaseUrl(): string {
  // Metro removes the development branch from release bundles. Preview builds
  // may still explicitly select their existing DEV API through eas.json.
  const defaultUrl = IS_DEV
    ? 'https://fitonus-api-dev.onrender.com/api/v1'
    : 'https://fitonus-api.onrender.com/api/v1';
  return (process.env.EXPO_PUBLIC_API_URL || defaultUrl).replace(/\/+$/, '');
}

export const Config = {
  API_BASE_URL: resolveApiBaseUrl(),
  IS_DEV,
  APP_VERSION: '1.0.0',
};
