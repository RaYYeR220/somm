import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "@qloo/qloo-harness", "@modelcontextprotocol/sdk"],
  poweredByHeader: false,
};

export default nextConfig;
