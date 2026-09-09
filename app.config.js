module.exports = ({ config }) => {
  // Use a different package ID for development builds so both
  // dev and production can run side by side on the same device.
  const isDev = process.env.EAS_BUILD_PROFILE === 'development';
  
  return {
    ...config,
    android: {
      ...config.android,
      package: isDev ? 'app.fourmytravels.dev' : 'app.fourmytravels',
    },
  };
};
