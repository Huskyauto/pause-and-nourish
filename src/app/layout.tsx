import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "Pause & Nourish",
  description:
    "A pause button for a habit: notice what's happening, pause for 90 seconds, then choose — no scoring, no shame. Wellness info only, not medical advice.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#2f5d3a",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-[#faf7f0] font-sans text-stone-900 antialiased">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
