import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: { root: process.cwd() },
};

export default config;
