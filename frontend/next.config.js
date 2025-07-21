/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: {
    devIndicators: false
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://winvite-backend/api/:path*'
      },
    ];
  },
};

module.exports = nextConfig;