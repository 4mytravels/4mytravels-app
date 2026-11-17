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
    // M3: colours come from src/theme/theme.ts only. A hex/rgba literal in a
    // screen or component is how 60+ one-off colours crept in; this keeps it
    // at zero. Add a token instead (src/theme/theme.ts).
    files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    ignores: ['src/theme/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#([0-9A-Fa-f]{3,4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/]',
          message: 'Hardcoded hex colour — use a token from src/theme/theme.ts.',
        },
        {
          selector: 'Literal[value=/^rgba?\\(/]',
          message: 'Hardcoded rgb/rgba colour — use a token from src/theme/theme.ts.',
        },
        {
          selector: 'TemplateElement[value.raw=/rgba?\\(|#[0-9A-Fa-f]{6}\\b/]',
          message: 'Hardcoded colour in a template string — interpolate a theme token.',
        },
      ],
    },
  },
  {
    ignores: ['dist/*', 'android/*', 'ios/*', 'node_modules/*', 'public/*', 'scripts/*'],
  },
]);
