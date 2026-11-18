# FitOnus mobile

The React Native/Expo application uses Expo Router, Zustand, TanStack Query, AsyncStorage, and SecureStore. Consult `package.json` for the installed versions.

- [Expo Go and device setup](docs/EXPO_GO.md)
- [Push notifications](docs/push-notifications.md)
- [Coding instructions](AGENTS.md)
- [Documentation index](../Resources/docs/INDEX.md#mobile)

Install dependencies with `npm ci` from `mobile/`, configure the API environment for the target device, and start with `npm start`. A physical device needs a reachable backend address.

Use `npm run typecheck`, `npm run lint`, and `npm test` for verification. Mobile tests also require backend dependencies because the test script uses the backend's `tsx` executable. Native build commands and release profiles are defined in `package.json` and `eas.json`.
