import "@safe-her/env/web";
import path from "node:path";
import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), geolocation=(self), payment=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Content-Security-Policy",
    value: buildCsp(process.env.NEXT_PUBLIC_SERVER_URL),
  },
];

/**
 * Production-tight CSP. `'unsafe-eval'` is only added under `next dev` (the
 * dev compiler needs it); the build ships without it. `connect-src` includes
 * the API origin from NEXT_PUBLIC_SERVER_URL plus the geocoding providers the
 * client talks to (when it is a cross-origin API). Map tiles load via <img>,
 * which the `https:` source in img-src covers.
 */
function buildCsp(apiUrl?: string): string {
  const isProd = process.env.NODE_ENV === "production";
  const scriptSrc = isProd ? "'self' 'unsafe-inline'" : "'self' 'unsafe-inline' 'unsafe-eval'";
  let connectSrc = "'self' ";
  if (apiUrl && /^https?:\/\//.test(apiUrl)) {
    connectSrc += `${apiUrl.trim().replace(/\/$/, "")} https://photon.komoot.io https://nominatim.openstreetmap.org`;
  } else {
    connectSrc += "https://photon.komoot.io https://nominatim.openstreetmap.org";
  }
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: https: blob:",
    `connect-src ${connectSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
  ].join("; ");
}

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  turbopack: {
    root: path.resolve(import.meta.dirname, "..", ".."),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
