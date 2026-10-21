import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  title: "Blockwise: a local first block editor that speaks Notion",
  description: "Open source block editor. Copy and paste blocks with Notion, import and export Notion Markdown, CSV and HTML archives, and sync through the official API.",
  icons: { icon: "/favicon.svg" },
  openGraph: { title: "Blockwise", description: "A local first block editor that speaks Notion's formats.", images: ["/social-preview.png"] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
