// Build-target gate.
//
// EXPO_TARGET=development  -> includes the expo-dev-client plugin + a .dev
//                             package id, so the dev-client build can attach
//                             to a Metro server (fast refresh, JS reload).
// anything else (default)  -> production build: no dev-client, no play-services,
//                             no ngrok. This is what Google Play and the
//                             F-Droid recipe build.
//
// F-Droid does not read eas.json; it clones the tag and runs its own recipe
// with `npm ci --omit=dev` and EXPO_TARGET unset. So the `production` eas
// profile below is only for Play -- the F-Droid build is the same commit.
const isDevTarget = () => process.env.EXPO_TARGET === 'development';

module.exports = ({ config }) => {
  const isDev = isDevTarget();
  const basePlugins = (config.plugins || []).filter(
    // Strip expo-dev-client from the static plugin list; it is appended
    // conditionally below so a production build can never pick it up.
    (p) => p !== 'expo-dev-client'
  );

  return {
    ...config,
    plugins: [
      ...basePlugins,
      'expo-build-properties',
      ...(isDev ? ['expo-dev-client'] : []),
    ],
    android: {
      ...config.android,
      // Side-by-side install: dev build gets its own package id so the
      // production app on the device is untouched.
      package: isDev ? 'app.fourmytravels.dev' : 'app.fourmytravels',
    },
  };
};
