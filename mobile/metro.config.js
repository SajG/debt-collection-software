const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

// Metro's default projectRoot is `mobile/`, so shared code that lives
// above it (packages/tokens/*.ts — the SY4 tokens + status vocabulary)
// is invisible unless we extend `watchFolders` and `nodeModulesPaths`.
// Do both together — the watch entry lets Metro FIND the file; the
// node_modules entry lets it resolve any transitive requires the
// shared file makes.
const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

// Watch the whole monorepo so Metro picks up packages/tokens/*.
config.watchFolders = [repoRoot];

// Include the repo-root node_modules so shared code that imports (e.g.)
// a shared devDep resolves through the top-level lockfile, and hoisted
// deps in the root still find their peers.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(repoRoot, "node_modules"),
];

// Transpile supabase packages — they use private class fields (#field)
// which Hermes requires Babel to transform before execution
config.transformer.transformIgnorePatterns = [
  "node_modules/(?!(@supabase|ws|isomorphic-ws)/)",
];

module.exports = config;
