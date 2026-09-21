import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "AGENT";
      status: "ACTIVE" | "INACTIVE";
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: "ADMIN" | "AGENT";
    status: "ACTIVE" | "INACTIVE";
  }
}
