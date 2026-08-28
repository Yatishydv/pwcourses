import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://pwcourses.onrender.com/api/:path*',
      },
      {
        source: '/socket.io/:path*',
        destination: 'https://pwcourses.onrender.com/socket.io/:path*',
      }
    ];
  },
};
export default nextConfig;
