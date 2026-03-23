import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  serverExternalPackages: ['gray-matter', 'unified', 'remark-parse', 'remark-stringify', 'remark-mdx'],
  experimental: {
    externalDir: true
  }
};

export default nextConfig;
