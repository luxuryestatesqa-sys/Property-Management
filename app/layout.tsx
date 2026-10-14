import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Script from "next/script";
import { auth } from "@/auth";
import SessionProviderWrapper from "@/components/SessionProviderWrapper";
import AppShell from "@/components/AppShell";
import { OrgProvider } from "@/components/OrgProvider";
import { getOrgBranding } from "@/lib/org";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const session = await auth();
  const org = session?.user?.organizationId ? await getOrgBranding(session.user.organizationId) : null;
  const name = org?.name ?? "Listings Portal";
  return {
    title: `${name} | Listings`,
    description: `Property listing and lead management for ${name}`,
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: name },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#eef0f6",
  // Lets the page draw under the status bar/notch on devices that need it,
  // which is what makes env(safe-area-inset-*) resolve to real values
  // instead of always 0 - without this, .safe-top/.safe-bottom do nothing.
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  const org = session?.user?.organizationId ? await getOrgBranding(session.user.organizationId) : null;
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* Part of the initial HTML (not a client component) so it paints the
            instant the OS hands off from its own app-launch splash, with no
            gap where neither is visible. See the #app-splash rules in
            globals.css for the fade-out, which runs on pure CSS. */}
        {/* The splash is for opening the app, so after the first page of a session it is skipped (a reload
            while you are working on a form should not cover the page). Runs before the first paint. */}
        <Script id="splash-once" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: 'try{if(sessionStorage.getItem("splash-seen")){document.documentElement.classList.add("no-splash")}else{sessionStorage.setItem("splash-seen","1")}}catch(e){}' }} />
        <div id="app-splash" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" />
        </div>
        <SessionProviderWrapper session={session}>
          <OrgProvider org={org ? { name: org.name, logoUrl: org.logoUrl } : null}>
            <AppShell>{children}</AppShell>
          </OrgProvider>
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
