// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Q1: an unstable useFocusEffect/useEffect callback caused an endless
    // query loop. Missing deps are a correctness bug here, not a style nit.
    rules: { 'react-hooks/exhaustive-deps': 'error' },
  },
  {
    ignores: ['dist/*', 'android/*', 'ios/*', 'node_modules/*', 'public/*', 'scripts/*'],
  },
]);
