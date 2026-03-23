import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trailingSlash: true,
  serverExternalPackages: ['gray-matter', 'unified', 'remark-parse', 'remark-stringify', 'remark-mdx'],
  experimental: {
    externalDir: true,
  },
  output: "export"
};

export default nextConfig;
