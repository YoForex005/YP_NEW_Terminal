/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  experimental: {
    optimizePackageImports: ['recharts', 'framer-motion', 'date-fns', 'lucide-react', 'lightweight-charts'],
    serverActions: {
      allowedOrigins: ['localhost:3002', '127.0.0.1:3002', '0.0.0.0:3002'],
    },
  },
  env: {
    MT5_AUTO_FALLBACK_ON_PERMISSIONS: process.env.MT5_AUTO_FALLBACK_ON_PERMISSIONS || 'false',
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.pravatar.cc',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'flagcdn.com',
      },
      {
        protocol: 'https',
        hostname: 's2.coinmarketcap.com',
      },
      {
        protocol: 'https',
        hostname: 'cdn-icons-png.flaticon.com',
      },
    ],
  },
};

export default nextConfig;
