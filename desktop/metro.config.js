const { makeMetroConfig } = require("expo-desktop-metro-config");
const path = require("node:path");

const config = makeMetroConfig(__dirname);
config.watchFolders = [
  ...(config.watchFolders || []),
  path.resolve(__dirname, ".."),
];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
module.exports = config;
