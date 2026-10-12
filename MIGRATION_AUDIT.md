# Migration audit: Vercel + Supabase -> Firebase / Google Cloud

Branch `firebase-migration` (from `origin/cloudsql-test`, commit f870964). Read-only audit; nothing was changed except this file.

## 1. Headline

The app is far less tied to Supabase and Vercel than expected, so the move is small.

- **Supabase is only a Postgres host.** No `@supabase/*` package, no Supabase Auth, Storage, Realtime, Edge Functions or RLS. The `supabase/` folder holds only a `.temp` cache. Moving the database is a connection-string change, and that has been proven (data already copied to Cloud SQL, counts matched).
- **Vercel is only a Node host.** No `@vercel/*` package, no crons, no edge-runtime routes, no ISR (`revalidate`), no `unstable_cache`. `vercel.json` only sets region `sin1`.
- **No file storage service is used.** All photos, logos, avatars and title-deed images are base64 data URLs stored in Postgres columns (`ListingImage.url`, `Organization.logoUrl`, `User.avatarUrl`, `Listing.titleDeedImage`, `Listing.authorizationFormImage`). So there is nothing to copy out of Supabase Storage. Moving images to Cloud Storage is optional (see 3).
- **Login is NextAuth (JWT) with credentials**, not Supabase Auth. Nothing to replace.

## 2. What must change

| Area | Change | Size |
|---|---|---|
| Hosting | Add `apphosting.yaml`, create an App Hosting backend from GitHub | small |
| DB connection | Cloud Run reaches Cloud SQL through the connector or a Unix socket instead of public 0.0.0.0/0 | small-medium |
| Prisma | Add `binaryTargets` for the Cloud Run image (`debian-openssl-3.0.x`) if the build image differs from the build machine; confirm in the first build | small |
| Env vars | Move secrets to Secret Manager: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`, `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_LOGIN_CONFIG_ID`, `OPENAI_API_KEY` | small |
| Base URL | `APP_BASE_URL` must be set on the new host. Code falls back to `VERCEL_URL` (lib/propertyFinder/sync.ts:42), which will not exist | small |
| Webhook URLs | Property Finder webhook, Meta webhook / deauthorize / data-deletion, Qatar Living feed key URLs and portal feed URLs (`/feeds/*`) all contain the domain. They change if the domain changes; keep the same domain at cutover to avoid re-registering | process |
| Comments / copy | Vercel-specific wording in 4 files (manifest.ts, photoBatches.ts, sync.ts, the PF test route's "Deployment Protection" message) | trivial |

### What works as-is
- Prisma schema, all 26 migrations, `scripts/copy-db.ts`.
- NextAuth, `proxy.ts` (middleware), all 70 API routes.
- Request body limit: `proxyClientMaxBodySize: 30mb`. Cloud Run allows 32 MB per request, so this is actually looser than Vercel's 4.5 MB (the reason `lib/photoBatches.ts` batches photos); batching can stay.
- `maxDuration = 60` in `app/api/listings/[id]/propertyfinder/route.ts` is Vercel-specific; Cloud Run's default request timeout (300 s) covers it.

### Environment variable names (values not read)
- Database: `DATABASE_URL`, `DIRECT_URL`
- Auth: `AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY` (optional, falls back to `AUTH_SECRET`), `ALLOW_SIGNUP`, `NEXT_PUBLIC_ALLOW_SIGNUP`
- App: `APP_BASE_URL` (plus `VERCEL_URL` fallback)
- Meta: `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_LOGIN_CONFIG_ID`, `META_GRAPH_VERSION`
- AI: `OPENAI_API_KEY`, `OPENAI_MODEL`
- Portal API keys (Property Finder, Qatar Living, Oryx, feeds) are **not** env vars: they live in the `PortalCredential` table per agency.
- Local `.env` defines: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `APP_BASE_URL`, `META_WEBHOOK_VERIFY_TOKEN`.

## 3. Risks

1. **Database is open to the internet** (0.0.0.0/0). Intended to be temporary; remove in the cutover once App Hosting uses the connector.
2. **Test copy holds live portal and Meta keys.** `PortalCredential` rows (6) and `MetaPage` (1) were copied unchanged. Anything that can reach the test database can publish to real portals. Blank them in the test copy before App Hosting testing, as the ground rules require.
3. **Data drift.** Supabase keeps receiving leads (Property Finder / Meta webhooks). The Cloud SQL copy is a snapshot; a final re-copy with writes frozen is required at cutover.
4. **No backup has run and no point-in-time recovery** on Cloud SQL. Take an on-demand backup before the big copy.
5. **Photos in the database.** 449 images as data URLs make the DB heavy and rows large. Not a blocker; moving to Cloud Storage would cut DB size and egress later. Check the DB size before sizing the instance (not measured in this phase).
6. **Instance size.** 1 vCPU / 1.7 GB, single zone, no HA. Fine for testing; for ~40-50 agents consider 2 vCPU / 7.5 GB and HA after cutover. Keep Prisma `connection_limit` low (Cloud SQL g1-small allows few connections).
7. **Public GitHub repository.** No secrets are committed (`.env*` ignored), but the full source is public.
8. **Cost surprise.** Blaze plan with no budget. Phase 2 adds alerts.
9. **Preview auth secret differs from production.** The Meta page token (encrypted with the production `AUTH_SECRET`) cannot be decrypted by the Cloud SQL preview. At cutover use the production `AUTH_SECRET` / `TOKEN_ENCRYPTION_KEY` so existing tokens and sessions keep working.

## 4. Tenant isolation review

**Design (good):** `requireSession()` (lib/api-helpers.ts) takes `organizationId` from the signed-in user, re-checks the user and agency in the database on every request, and returns a Prisma client (`lib/tenant.ts`) that adds `organizationId` to every read, update and delete on agency-owned models and stamps every create. Child tables (images, audit log, portal state) are scoped through their listing, and creating a child on another agency's listing is blocked. No API route accepts an `organizationId` / `agencyId` from the client. ID-only updates/deletes (`where: { id }`, 22 sites, e.g. app/api/leads/stages/[id]/route.ts:64) are safe because the scoped client adds the agency to the `where`. Inside an agency, Agents only see their own leads (all `/api/leads/**` routes check `isManagerRole` or `assignedToId`), and listing owner details are redacted for other agents (lib/listingPrivacy.ts).

**Routes without a session (by design), and why each is safe or not:**

| Route | How it finds the agency | Verdict |
|---|---|---|
| `/api/auth/*` | n/a | ok |
| `/api/signup` | creates a new agency | ok; rate limited |
| `/api/meta/webhook` | Page id -> `MetaPage`, HMAC signature with app secret | ok |
| `/api/meta/deauthorize`, `data-deletion` | signed request, deletes by Facebook user id | ok |
| `/api/portals/propertyfinder/webhook` | listing -> owner agency, per-agency HMAC secret (now required for lead events) | ok, see gap 1 |
| `/api/qatar-living/**` | `X-API-Key` -> `PortalCredential.feedToken` -> agency | ok |
| `/feeds/[portal]` | `token` + `agency` must both match one credential row; constant-time compare | ok |
| `/api/public/listings/[id]` | numeric listing id; checks agent belongs to same agency; hides owner/unit data | gap 2 |
| `/api/listings/[id]/images/[imageId]` | unguessable image id plus listing id | ok, see gap 3 |

**Gaps (ranked):**

1. **Property Finder profile id is not unique across agencies** (`User.pfPublicProfileId`, schema.prisma:143; lookup `findFirst` at app/api/portals/propertyfinder/webhook/route.ts:45). If two agencies link the same profile id, lead events go to whichever row is found first; its signature check then fails for the other agency's real events, so that agency loses leads. It cannot leak data (a secret is required), but it is a denial of service between tenants. Fix: unique index on the profile id, or try every matching agency's secret.
2. **Share links use sequential listing numbers** (`/listing/[id]`, app/api/public/listings/[id]/route.ts:13). Anyone can walk ids 1..N and read every agency's shared-listing content (title, photos, price, building; not owner, floor or unit). Fix: random public token per listing.
3. **Image URLs are public by design** for portal crawlers. Images of PRIVATE-visibility listings are still served to anyone holding the URL. The image ids are random, so this is low risk.
4. **Email enumeration**: signup and add-user return "already exists" (needed for usability). Low.
5. **Isolation tests are skipped by default.** `lib/tenant.integration.test.ts` and the leads integration tests only run with `RUN_TENANT_DB_TESTS` set and a database. They have not been run against Cloud SQL. Run them on a throwaway database in Phase 3.
6. **`lib/leads/stages.ts`, `lib/meta/sync.ts`, `lib/ai/openai.ts`, `lib/feeds/generateFeed.ts`** use the global client but always receive an `organizationId` argument and filter by it. Safe today, but not enforced by the type system; a future caller could pass the wrong id.

## 5. Questions for you

1. Keep the same domain at cutover? (Avoids re-registering Property Finder, Meta and Qatar Living URLs.) What is it?
2. Is moving photos out of Postgres into Cloud Storage in scope now, or after cutover?
3. App Hosting region: should it be near Doha (`me-central1`) if offered, or accept the nearest supported region? (Checked in Phase 3.)
4. Should the test copy have all portal and Meta keys blanked before App Hosting testing? (Recommended.)
5. Is it acceptable to fix gaps 1 and 2 (unique profile id, random share token) as part of Phase 3? Gap 2 changes shared links already sent to clients unless old numeric links keep working for a transition period.
6. What is the Supabase plan and current monthly cost, for the before/after comparison?
