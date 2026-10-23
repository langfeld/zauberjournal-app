// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    rules: {
      // Hermes ruft dafür auf Android jedes Mal Java auf und sucht die Locale (siehe packages/core/src/text.ts).
      'no-restricted-properties': [
        'error',
        { property: 'localeCompare', message: 'compareText oder compareDates aus @zauberjournal/core nehmen: Auf Android ist localeCompare sehr langsam.' },
        { property: 'toLocaleLowerCase', message: 'toLowerCase() nehmen: Für Deutsch dasselbe, auf Android viel schneller.' },
        { property: 'toLocaleUpperCase', message: 'toUpperCase() nehmen: Für Deutsch dasselbe, auf Android viel schneller.' },
      ],
    },
  },
]);
