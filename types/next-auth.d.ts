import { DefaultSession } from "next-auth";

type Role = "OWNER" | "ADMIN" | "MANAGER" | "AGENT";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      status: "ACTIVE" | "INACTIVE";
      organizationId: string;
      // What this person may do (see lib/permissions.ts); Owners and Super Admins have all of them.
      permissions: string[];
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: Role;
    status: "ACTIVE" | "INACTIVE";
    organizationId: string;
  }
}
