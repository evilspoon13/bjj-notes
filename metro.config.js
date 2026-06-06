// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite's web build imports a WASM SQLite module (./wa-sqlite/wa-sqlite.wasm).
// Metro doesn't resolve .wasm as an asset by default, which breaks web bundling.
// (Native iOS/Android use the built-in SQLite and don't hit this path.)
config.resolver.assetExts.push('wasm');

module.exports = config;
