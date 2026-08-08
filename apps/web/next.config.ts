import "@safe-her/env/web";
import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  turbopack: {
    root: path.resolve(import.meta.dirname, "..", ".."),
  },
};

export default nextConfig;
