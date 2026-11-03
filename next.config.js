/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    // face-api's package "main" is the Node build; the browser must get the ESM
    // bundle (TensorFlow.js included). It is only ever imported from client code.
    if (!isServer) {
      config.resolve.alias['@vladmandic/face-api'] = '@vladmandic/face-api/dist/face-api.esm.js';
    }
    return config;
  },
  async headers() {
    return [
      {
        // Model weights never change; let phones cache them for good.
        source: '/models/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
