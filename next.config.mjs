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
  // optimizePackageImports was benchmarked and removed: bundle sizes were
  // byte-identical (lucide-react is already in Next's default list and
  // recharts never reaches a client bundle).
};

export default nextConfig;
