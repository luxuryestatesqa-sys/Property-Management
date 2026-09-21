# Luxury Estates — Agent Listings

A mobile-first internal property listing app for ~40 agents. Every agent adds
their own For Rent / For Sale properties; every agent can instantly search
and filter the whole company database and see exactly which agent added
each listing.

Built with Next.js (App Router), TypeScript, Tailwind CSS, Prisma, and
Auth.js (NextAuth) credentials-based login.

## Current deployment

This project's `DATABASE_URL` points at a live Supabase Postgres project
(`bdkrghcxkzbjqqlnbgku`) — not the local SQLite file used earlier in
development. The database currently has exactly one real account (no demo
data):

| Role  | Email                   |
|-------|-------------------------|
| Admin | info@luxuryestates.qa   |

The admin's password was set directly by the account owner and isn't
recorded here. Use **Admin → Users** to create real agent accounts (a
WhatsApp number is required for each), and **Profile → Change Password** to
update the admin's own password.

## Deploying to Vercel

The app is a standard Next.js app — Vercel is a verified deployment target,
no special adapter config needed. Two things matter beyond the default
"import the repo" flow:

1. **Set environment variables** in the Vercel project (Settings →
   Environment Variables), not just locally in `.env`:
   - `DATABASE_URL` — use Supabase's **pooled** connection string, not the
     direct one. In the Supabase dashboard: Project Settings → Database →
     Connection pooling → "Transaction" mode (port `6543`). Vercel's
     functions are serverless — each invocation can open its own DB
     connection, and going straight to Postgres's direct port (5432) will
     exhaust its connection limit under real traffic from ~40-50 agents.
     The pooled connection is what prevents that.
   - `DIRECT_URL` — the direct (non-pooled) connection, port `5432` (the
     same one currently in local `.env`). Prisma migrations need this even
     though the app queries through the pooled `DATABASE_URL` at runtime.
   - `AUTH_SECRET` — reuse the value from local `.env`, or generate a fresh
     one (`npx auth secret` or `openssl rand -base64 32`) — either is fine,
     just make sure whatever you set is only ever in Vercel's env vars, not
     committed to git.
   - You do **not** need to set `AUTH_TRUST_HOST` or `AUTH_URL` — Auth.js
     detects Vercel's `VERCEL` environment variable automatically and
     trusts the host.
2. **Run the migration against Supabase before/after first deploy** (from
   your machine, with local `.env` pointed at the same Supabase project):
   `npx prisma migrate deploy`. Vercel's build step does not run migrations
   for you.

After that, `git push` to the branch Vercel is tracking (or connect the
GitHub repo in the Vercel dashboard) triggers a normal build + deploy.

## Getting started (fresh local setup)

If you ever want a disposable local copy to test against instead of the
live Supabase database, point `DATABASE_URL` in `.env` back at a local
SQLite file, set `provider = "sqlite"` in `prisma/schema.prisma`, then:

```bash
npm install
npm run db:migrate   # creates the SQLite database and applies the schema
npm run db:seed      # creates a demo admin, 5 sample agents, and sample listings
npm run dev
```

Open http://localhost:3000 on your phone (or in a mobile-width browser
window / device toolbar). `npm run db:seed` is for that local/demo scenario
only — it was not run against the live Supabase database.

## What's included

- **Properties (home)** — instant search (location, building, apartment,
  agent, listing ID), an always-visible results count, quick All/For
  Rent/For Sale tabs, and a full filter bottom sheet (Location →
  Area/Community → Building, listing type, property type, bedrooms,
  dual-handle rent/sale price sliders, furnished, bills, availability,
  agent, status). Property type and bedrooms pickers are collapsible chip
  grids, so they stay out of the way until tapped.
- **Add Property** — for rent / for sale, property type (apartment, villa,
  townhouse, penthouse, duplex, compound villa, whole building, office,
  retail, land), bedrooms (Studio through 6+, with maid's-room variants —
  only asked for residential types), optional size in sqm, and the rest of
  the minimal required fields. Automatic duplicate detection (same
  Area+Community+Building+Floor+Apartment) shows a "Possible Duplicate"
  warning — with a one-tap WhatsApp button to message the other agent —
  and still allows "Continue Anyway"; the two listings stay separate, each
  owned by its own agent.
- **Availability status** — separate from the Active/Inactive soft-delete
  toggle: Available / Reserved / Rented (for rentals) or Available /
  Reserved / Sold (for sales), editable from My Listings (one-tap chips) or
  the listing's edit screen, and filterable.
- **My Listings** — Active / Inactive tabs, edit, deactivate/reactivate
  (soft-delete only — history and original creation date are preserved).
- **Property details** — full location + pricing + listing metadata
  (Listing ID, Added By, Original Added Date/Time, Last Updated, Status),
  other agents' listings for the same unit, and an edit-history audit trail.
- **Agent contact** — every agent has a mandatory WhatsApp number. A
  WhatsApp button appears next to the agent's name everywhere a listing
  shows who added it, opening a pre-filled chat in a new tab.
- **Profile** — name/email/status, a profile photo (resized/compressed
  client-side, no external storage needed), an editable WhatsApp number,
  change password (requires current password), log out.
- **Admin → Users** — create/activate/deactivate/remove agents (WhatsApp
  number required on create). Removing a user who already has listings
  deactivates them instead, so historical listing ownership is never
  deleted. Admins can also **reset any agent's password** — generates a
  temporary password, shareable via copy or a pre-filled WhatsApp message;
  the agent can change it themselves afterward from Profile. The login page
  points agents who forget their password to ask their admin.

## Data model

See [prisma/schema.prisma](prisma/schema.prisma). `User`, `Listing`, and
`AuditLog` tables, with indexes on every field used for search/filter
(area, community, buildingName, apartmentNumber, floor, listingType,
propertyCategory, bedrooms, rentPrice, salePrice, status, availabilityStatus,
createdBy) so search stays fast as the database grows. All listing
timestamps (`createdAt`, `updatedAt`, `deactivatedAt`) are generated by the
database, never the client device.

## Useful scripts

```bash
npm run db:studio   # visual database browser (Prisma Studio)
npm run build        # production build
```

## Notes on the current setup

- The database is Supabase Postgres (see "Current deployment" above).
  `prisma/schema.prisma` has `provider = "postgresql"`, and `DATABASE_URL`
  in `.env` holds the (percent-encoded) Supabase connection string — special
  characters like `@` in the password must be percent-encoded (`@` → `%40`)
  or the URL won't parse correctly.
- `prisma/schema.prisma` also declares `directUrl`, read from a separate
  `DIRECT_URL` env var. Locally both point at the same direct connection;
  on Vercel `DATABASE_URL` should be the pooled connection instead — see
  "Deploying to Vercel" above.
- `AUTH_SECRET` in `.env` is a real random secret, generated for this
  deployment — don't reuse the old local-dev placeholder.
- `.env` is gitignored and must never be committed — it holds the live
  database password.
- Profile photos are stored as resized/compressed JPEG data URLs directly on
  the `User` row (no separate file storage/CDN needed at this scale). If the
  user base grows much larger, move avatars to object storage instead and
  store a URL in their place.
