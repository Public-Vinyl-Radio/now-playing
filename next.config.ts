import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1", ...(process.env.PVR_DEV_ORIGINS ?? "").split(",").map(value => value.trim()).filter(Boolean)],
  turbopack: { root: process.cwd() },
};

export default config;
