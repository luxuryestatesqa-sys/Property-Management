import { DefaultSession } from "next-auth";

type Role = "OWNER" | "ADMIN" | "MANAGER" | "AGENT";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      status: "ACTIVE" | "INACTIVE";
      organizationId: string;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: Role;
    status: "ACTIVE" | "INACTIVE";
    organizationId: string;
  }
}
