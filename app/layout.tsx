import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SessionProviderWrapper from "@/components/SessionProviderWrapper";
import AppShell from "@/components/AppShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Luxury Estates | Listings",
  description: "Internal property listing management for Luxury Estates agents",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Luxury Estates",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0f3d3e",
  // Lets the page draw under the status bar/notch on devices that need it,
  // which is what makes env(safe-area-inset-*) resolve to real values
  // instead of always 0 - without this, .safe-top/.safe-bottom do nothing.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <SessionProviderWrapper>
          <AppShell>{children}</AppShell>
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
