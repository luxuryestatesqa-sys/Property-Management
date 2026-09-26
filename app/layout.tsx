import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { auth } from "@/auth";
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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* Part of the initial HTML (not a client component) so it paints the
            instant the OS hands off from its own app-launch splash, with no
            gap where neither is visible. See the #app-splash rules in
            globals.css for the fade-out, which runs on pure CSS. */}
        <div id="app-splash" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" />
        </div>
        <SessionProviderWrapper session={session}>
          <AppShell>{children}</AppShell>
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
