// Meta (Facebook / Instagram) lead ads. One Meta app belongs to whoever runs this software; each
// agency then connects its own Facebook Pages through it. The app's credentials live in the
// server's environment variables, never in the database or the browser.

export const META_ENV_HELP = {
  META_APP_ID: "The App ID from your Meta app's Settings > Basic",
  META_APP_SECRET: "The App Secret from Settings > Basic",
  META_WEBHOOK_VERIFY_TOKEN: "Any long random text you choose. You paste the same text into Meta's webhook setup.",
} as const;

export function metaEnv() {
  return {
    appId: process.env.META_APP_ID?.trim() || "",
    appSecret: process.env.META_APP_SECRET?.trim() || "",
    verifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || "",
    // Optional: the "configuration" of Facebook Login for Business, if the app uses one.
    loginConfigId: process.env.META_LOGIN_CONFIG_ID?.trim() || "",
  };
}

export function missingMetaEnv(): string[] {
  const e = metaEnv();
  return [e.appId ? "" : "META_APP_ID", e.appSecret ? "" : "META_APP_SECRET", e.verifyToken ? "" : "META_WEBHOOK_VERIFY_TOKEN"].filter(Boolean);
}

export const graphVersion = () => process.env.META_GRAPH_VERSION?.trim() || "v25.0";

// What we ask the person connecting to allow. Each of these needs Meta's App Review before people
// outside your own Meta app's team can use it (see the setup guide).
export const META_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_metadata", "pages_manage_ads", "leads_retrieval"];

export const META_CALLBACK_PATH = "/api/meta/callback";
export const META_WEBHOOK_PATH = "/api/meta/webhook";
