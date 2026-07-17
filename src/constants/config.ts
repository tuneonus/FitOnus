export const Config = {
  API_BASE_URL: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1',
  IS_DEV: __DEV__,
  APP_VERSION: '1.0.0',
};
