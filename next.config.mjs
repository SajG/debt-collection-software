/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Supabase Storage signed URLs (company logo previews).
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/sign/**",
      },
    ],
  },
  // Custom webpack() disables the build worker unless this is set.
  experimental: {
    webpackBuildWorker: true,
  },
  webpack(config) {
    // @supabase/ssr pulls GoTrueClient (~250kiB) and storage-js (~106kiB)
    // into middleware. Webpack's pack cache serializes those sources as
    // strings and warns above 100kiB. We cannot split the vendor files;
    // keep the filesystem cache and drop only that infrastructure warning.
    config.plugins.push({
      apply(compiler) {
        compiler.hooks.infrastructureLog.tap(
          "IgnorePackCacheBigStringWarning",
          (_name, type, args) => {
            if (
              type === "warn" &&
              typeof args?.[0] === "string" &&
              args[0].includes("Serializing big strings")
            ) {
              return true;
            }
          }
        );
      },
    });
    return config;
  },
  // optimizePackageImports was benchmarked and removed: bundle sizes were
  // byte-identical (lucide-react is already in Next's default list and
  // recharts never reaches a client bundle).
};

export default nextConfig;
