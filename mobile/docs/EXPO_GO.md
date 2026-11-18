# Expo Go compatibility — SDK 58

## Dependency audit

- `react-native-mmkv` requires native code not bundled in Expo Go. Replaced at the source boundary with `@react-native-async-storage/async-storage`.
- `react-native-nitro-modules` was an MMKV peer dependency. It is not needed by the replacement.
- `expo-dev-client` is for development builds and is not needed to launch in Expo Go.
- Keep Expo Router, SecureStore, Blur, Haptics, Camera, Constants, Device, Font, Glass Effect, Image, Image Picker, Linking, Location, Notifications, Splash Screen, Status Bar, Symbols, System UI, Web Browser and Expo UI at SDK 58-compatible versions.
- Gesture Handler, Reanimated/Worklets, Safe Area Context, Screens, SVG, NetInfo, Lottie and Keyboard Controller have Expo Go support when their versions match the selected SDK.
- Bottom Sheet uses supported Gesture Handler/Reanimated dependencies. Lucide uses SVG. Neither requires an additional native module.
- Zustand, TanStack Query, Axios, Day.js, React Hook Form, Hook Form Resolvers and Zod do not add native modules.
- React, React DOM, React Native and React Native Web must match the Expo SDK baseline.
- TypeScript, ESLint, Expo ESLint configuration and Prettier packages are development tooling, not device native dependencies.

## Behavioral changes

`npm start`, `npm run android` and `npm run ios` target Expo Go. Native build commands remain available as `npm run build:android` and `npm run build:ios`.

Preferences now use asynchronous storage. Root startup explicitly hydrates the Zustand onboarding store before deciding where to navigate. Theme preferences load before rendering the app. Authentication tokens continue to use SecureStore.

Expo Go has a separate application sandbox. Preferences and tokens from an existing standalone/development app are not transferred. MMKV preferences cannot be read from Expo Go; defaults apply on first launch.

Feature stack layouts preserve the four tab destinations and allow nested screens to use the existing stack headers. The custom tab bar and screen styling are retained.

## Run

Use an Expo Go binary that supports SDK 58. Check https://expo.dev/go for available versions; a current store binary may support a newer SDK. Older physical iOS binaries generally cannot be installed from this selector.

```sh
npm ci
npx expo start
```

Connect the phone and computer to the same LAN, then scan the QR code in Expo Go (Android) or Camera (iOS). If LAN access is blocked, try `npx expo start --go --tunnel` (requires network access and the Expo tunnel dependency).

The dashboard API URL uses `EXPO_PUBLIC_API_URL`. A physical phone cannot reach a backend on the computer through `localhost`; use the computer's reachable LAN address. Existing dashboard mock fallback behavior has been preserved.

## Limitations

- Authentication, coach responses and workout data remain the existing mocks. This migration does not implement missing backend features or empty action handlers.
- Remote push notifications on Android and background location are not available in Expo Go. No current screen calls these APIs.
- App icon, splash screen and native config plugin changes require a native binary to take full effect; Expo Go uses its host configuration.
- Glass Effect and Symbols depend on platform/OS support. Current screens do not import them.
- No physical-device QR scan or interactive screen verification has been performed by the agent. Metro startup and bundling are distinct from a successful device run.

## Validation

- Installed baseline: Expo 58.0.22, React Native 0.88.1, React 19.3.0, AsyncStorage 2.2.0.
- `npx expo install --fix`: dependencies up to date.
- `npx expo-doctor`: 20/20 checks passed.
- TypeScript and ESLint source checks passed after adapting SDK 58 tab navigation and React Native prop/ref types.
- Metro starts in Expo Go mode and generates an `exp://` QR code.
- Android and iOS development bundles were requested from Metro for dependency resolution validation; this is not interactive device testing.
- Storage conversion and Zustand async hydration passed 12 total in-memory assertions; native persistence still needs a device check.

For a stale dependency-graph error after upgrading, stop old Metro instances and restart with `npx expo start --go --clear`. The installed React Native now exports `react-native/unstable-internals-do-not-use`.
