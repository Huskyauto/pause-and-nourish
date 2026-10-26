import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pause & Nourish",
    short_name: "Pause&Nourish",
    description:
      "A pause button for a habit: notice, pause 90 seconds, then choose. Wellness info only, not medical advice.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf7f0",
    theme_color: "#2f5d3a",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
