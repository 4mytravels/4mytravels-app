// Metro config — Expo defaults plus WOFF2 as an asset type (M6: the web build
// ships the Latin-subset fonts as WOFF2; native keeps the subset TTFs, since
// Android/iOS font loading does not take WOFF2).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
if (!config.resolver.assetExts.includes('woff2')) config.resolver.assetExts.push('woff2');

module.exports = config;
