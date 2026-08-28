import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://172.28.128.193:5555/api/:path*',
      },
      {
        source: '/socket.io/:path*',
        destination: 'http://172.28.128.193:5555/socket.io/:path*',
      }
    ];
  },
};
export default nextConfig;
