/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'export',
  serverExternalPackages: ["@duckdb/node-api"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
