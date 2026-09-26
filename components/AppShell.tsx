"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ReactNode } from "react";
import BottomNav from "./BottomNav";
import { ConfirmProvider } from "./ConfirmDialog";
import InstallPrompt from "./InstallPrompt";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { status } = useSession();
  const isPublicShare = pathname.startsWith("/listing/");
  // The public share link (/listing/[id]) is opened by clients with no CRM
  // account - the internal nav bar would just send them to a login wall.
  const hideNav = pathname === "/login" || isPublicShare;

  return (
    <ConfirmProvider>
      <div className="min-h-screen flex flex-col">
        <div className={`flex-1 mx-auto w-full max-w-md ${hideNav ? "" : "pb-20"}`}>{children}</div>
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
