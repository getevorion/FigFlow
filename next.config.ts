import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@resvg/resvg-js", "@wasm-fmt/clang-format", "sharp", "tsx", "yazl"],
  outputFileTracingIncludes: {
    "/api/**/*": ["./runtime/**/*", "./package.json"],
  },
};

export default nextConfig;
