"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ReactNode } from "react";
import BottomNav from "./BottomNav";
import Sidebar from "./Sidebar";
import CommandPalette from "./CommandPalette";
import { ConfirmProvider } from "./ConfirmDialog";
import InstallPrompt from "./InstallPrompt";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { status } = useSession();
  const isPublicShare = pathname.startsWith("/listing/");
  // The public share link (/listing/[id]) is opened by clients with no CRM
  // account - the internal nav bar would just send them to a login wall.
  const hideNav = pathname === "/login" || pathname === "/signup" || pathname === "/forgot-password" || pathname === "/reset-password" || pathname === "/data-deletion" || pathname === "/privacy" || pathname === "/terms" || isPublicShare;

  return (
    <ConfirmProvider>
      <div className={`min-h-screen flex flex-col ${hideNav ? "" : "lg:pl-[76px] xl:pl-64"}`}>
        {/* Phones/tablets: a centred single column with the bottom tab bar.
            Desktop (lg+): a left sidebar and a wide, padded content area. */}
        <div
          className={`min-w-0 flex-1 mx-auto w-full max-w-md ${
            hideNav ? "lg:max-w-none" : "pb-20 lg:pb-10 lg:max-w-[1440px] lg:px-6 xl:px-8"
          }`}
        >
          {children}
        </div>
        {!hideNav && <Sidebar />}
        {!hideNav && <CommandPalette />}
        {!hideNav && <BottomNav />}
        {/* Only for a visitor who isn't signed in yet - once an agent is
            logged in (or opens a shared listing link, which isn't an agent
            at all) this has no reason to show. InstallPrompt itself also
            hides once the app is already installed (running standalone). */}
        {!isPublicShare && status === "unauthenticated" && <InstallPrompt bottomClassName={hideNav ? "bottom-4" : "bottom-20"} />}
      </div>
    </ConfirmProvider>
  );
}
