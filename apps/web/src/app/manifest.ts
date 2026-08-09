import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SafeHer — Women's Safety App",
    short_name: "SafeHer",
    description:
      "AI-powered community safety — live risk map, incident reports and one-tap SOS for Delhi.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#e11d48",
    categories: ["safety", "health", "social"],
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}