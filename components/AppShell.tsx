"use client";

import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import BottomNav from "./BottomNav";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hideNav = pathname === "/login";

  return (
    <div className="min-h-screen flex flex-col">
      <div className={`flex-1 mx-auto w-full max-w-md ${hideNav ? "" : "pb-20"}`}>{children}</div>
      {!hideNav && <BottomNav />}
    </div>
  );
}
