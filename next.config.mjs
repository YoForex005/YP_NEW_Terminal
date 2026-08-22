/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Hide the circular Next.js "N" badge that overlays the terminal footer in dev.
  devIndicators: false,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  experimental: {
    optimizePackageImports: ['recharts', 'framer-motion', 'date-fns', 'lucide-react', 'lightweight-charts'],
    serverActions: {
      allowedOrigins: [
        'localhost:3002',
        '127.0.0.1:3002',
        '0.0.0.0:3002',
        'terminal.yopips.com',
      ],
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
  async headers() {
    // Baseline browser hardening for the trading UI. Tune CSP further at the edge if needed.
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      {
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
          "object-src 'none'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https:",
          "font-src 'self' data:",
          "connect-src 'self' https: wss: ws:",
          "frame-src 'self' https://verification.didit.me https://didit.me",
        ].join('; '),
      },
    ];

    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
