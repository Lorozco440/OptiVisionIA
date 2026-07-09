import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.101.8'], // ← tu IPv4 real de WiFi
};

export default nextConfig;