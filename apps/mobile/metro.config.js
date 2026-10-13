// Expo's default config already understands npm workspaces (watchFolders and
// node_modules lookups up to the repo root); NativeWind compiles global.css.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });
