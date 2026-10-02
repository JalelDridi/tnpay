import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The workspace packages are consumed from source; Next compiles them.
  transpilePackages: ["@tnpay/core", "@tnpay/konnect"],
};

export default nextConfig;
