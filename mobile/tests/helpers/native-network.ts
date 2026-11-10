// Node cannot load React Native's Flow entry point. Stub only the native network
// boundary so the actual offline services and stores run in these regression tests.
import Module, { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const path = require.resolve('@react-native-community/netinfo');
const nativeModule = new Module(path);
export const networkState = { isConnected: false, isInternetReachable: false };
nativeModule.exports = {
  __esModule: true,
  default: { fetch: async () => networkState, addEventListener: () => () => {} },
};
require.cache[path] = nativeModule;
