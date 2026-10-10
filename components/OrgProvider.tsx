"use client";

import { createContext, ReactNode, useContext } from "react";

export interface OrgInfo {
  name: string;
  logoUrl: string | null;
}

const DEFAULT_ORG: OrgInfo = { name: "Listings Portal", logoUrl: null };

const OrgContext = createContext<OrgInfo>(DEFAULT_ORG);

// The signed-in agency's name and logo, so the sidebar, install prompt and
// other chrome show the agency's own brand instead of a hard-coded one.
export function OrgProvider({ org, children }: { org: OrgInfo | null; children: ReactNode }) {
  return <OrgContext.Provider value={org ?? DEFAULT_ORG}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgInfo {
  return useContext(OrgContext);
}
