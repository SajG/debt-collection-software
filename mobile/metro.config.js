const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Transpile supabase packages — they use private class fields (#field)
// which Hermes requires Babel to transform before execution
config.transformer.transformIgnorePatterns = [
  "node_modules/(?!(@supabase|ws|isomorphic-ws)/)",
];

module.exports = config;
