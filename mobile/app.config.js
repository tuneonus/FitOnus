// Dynamic wrapper around app.json (which stays the source of truth).
//
// google-services.json is intentionally NOT committed. EAS cloud builds only upload files that are
// not git-ignored, so on EAS the file is supplied as a "file" environment variable named
// GOOGLE_SERVICES_JSON (EAS exposes its path at build time). Locally (expo prebuild / run:android)
// the variable is unset and the existing ./google-services.json from app.json is used unchanged.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? config.android?.googleServicesFile,
  },
});
