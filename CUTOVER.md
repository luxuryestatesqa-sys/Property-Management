# Production cutover: Vercel + Supabase -> Firebase App Hosting + Cloud SQL

Written, not run. You run it (or tell Claude to run a numbered step). Nothing here has been executed.

Target: App Hosting backend `crm-test` (asia-southeast1) + Cloud SQL `luxury-crm-sg` (asia-southeast1), project `luxury-estate-crm`.
Source of truth until cutover: Supabase `bdkrghcxkzbjqqlnbgku` + Vercel project `property-management` (branch `main`).

## 0. Read this first

1. **Production Vercel runs OLD code.** `origin/main` does not have the multi-agency code, leads, Meta, share tokens or the security fixes. Cutover is therefore the first time production gets ~25 commits at once. Rolling back means going back to the old code *and* the old behaviour, not just a different server.
2. **The test copy has its portal and Meta keys blanked.** The final data copy (step 4) uses `--wipe-target` and brings the real keys back. After that, the Firebase site can publish to real portals. Do not click Publish / Sync during smoke tests unless you mean it.
3. **Logins now go through Firebase Authentication** (`AUTH_PROVIDER=firebase` in `apphosting.yaml`); to go back to database passwords, remove that line and redeploy. **Users must use the same `AUTH_SECRET` and `TOKEN_ENCRYPTION_KEY` as production**, otherwise everyone is logged out and the stored Meta page token cannot be decrypted. See step 2.
4. **Public IP cannot be switched off** while the Cloud SQL connector is used the way `lib/prisma.ts` uses it (public IP type). With no authorized networks the database is still unreachable from the internet; only the connector (IAM) gets in. Going fully private needs a VPC and a code change, not part of this cutover.

## 1. Decisions needed before a date is set

| # | Question | Why |
|---|---|---|
| 1 | Production domain (and where its DNS is managed) | Webhooks and feed URLs registered with Property Finder, Meta and Qatar Living contain it. Keep the same domain so nothing is re-registered. |
| 2 | Quiet window (Qatar time) | Writes are paused for about 30-60 minutes. |
| 3 | Current Supabase and Vercel plans and monthly cost | For the cost comparison below. |
| 4 | OK to pull production env values from Vercel | Needed once, to copy `AUTH_SECRET` etc. into Secret Manager. |
| 5 | Approve raising the budget | See section 6: the $10 budget will alert every month. |

## 2. Preparation (days before; none of this affects production)

1. Lower the DNS TTL of the domain to 300 seconds, 48 hours before.
2. Put production secrets into Secret Manager (values never printed):
   - `crm-auth-secret` <- production `AUTH_SECRET`
   - `crm-token-encryption-key` <- production `TOKEN_ENCRYPTION_KEY` if set (otherwise it is derived from `AUTH_SECRET`)
   - `crm-meta-app-id`, `crm-meta-app-secret`, `crm-meta-webhook-verify-token`, `crm-meta-login-config-id`, `crm-openai-api-key` as used today
   - `firebase apphosting:secrets:grantaccess <name> --backend crm-test` for each new one
   - uncomment the matching lines in `apphosting.yaml`
3. In `apphosting.yaml` set `minInstances: 1` (Property Finder must get an answer in 5 seconds; a cold start can take longer).
4. Add `ALLOW_NUMERIC_SHARE_LINKS` later, not now: old shared links must keep working through the transition.
5. Run the full test checklist on the `hosted.app` URL (login, leads, listings, second-agency isolation, agent privacy, share links). Fix anything found.
6. **Rehearse a restore:** create an on-demand Cloud SQL backup, then restore it into a throwaway instance or clone, and confirm row counts. Delete the clone afterwards. An untested backup is not a backup.
7. Add a "copy new rows back" option to `scripts/copy-db.ts` (a `--skip-column shareToken` flag, because Supabase lacks that column). Needed for the rollback in section 5; do it before the cutover day, not during.
8. Take a Supabase backup you can restore from (dashboard backup or a full export), and keep it.

## 3. Cutover day

Tell agents the CRM will be read-only / closed for the window. There is no maintenance-mode switch in the app, so "frozen" means nobody edits.

| Step | Action | Check |
|---|---|---|
| 1 | Announce. Note the time `T0` (UTC). | Agents are off the system. |
| 2 | Pause intake: in the Meta app, leave the webhook as is (Meta retries and the app can backfill, step 9). Property Finder leads are also backfilled in step 9. | Nothing to switch off. |
| 3 | Cloud SQL on-demand backup: `gcloud sql backups create --instance=luxury-crm-sg --project=luxury-estate-crm --description="pre-cutover"` | Backup shows DONE. |
| 4 | Final copy, which restores the real portal and Meta keys: `SOURCE_DATABASE_URL=<supabase direct> TARGET_DATABASE_URL=<singapore> npx tsx scripts/copy-db.ts --wipe-target` | Every table `source == target now`; no `MISMATCH`. |
| 4b | Re-import users into Firebase Authentication (the final copy replaced the user table, so Firebase must match it): `DATABASE_URL=<singapore> npx tsx scripts/export-auth-users.ts <file.json>`, then `firebase auth:import <file.json> --hash-algo=BCRYPT --project luxury-estate-crm`, then delete the file (it holds password hashes). Check Authentication shows the same number of users as the `User` table. Users missing from Firebase are created automatically on their first correct login, but import first so the console is complete. | Firebase user count == `User` rows. |
| 5 | Redeploy so the app picks up the production secrets: `firebase deploy --only apphosting --project luxury-estate-crm --non-interactive` | Rollout succeeds. |
| 6 | Smoke test on the `hosted.app` URL with real data (no Publish): log in as an Owner and as an Agent, open Leads, a listing with photos, Users, Settings; open one new-style share link and one old numeric link. | All load; Agent sees only own leads. |
| 7 | Add the custom domain in Firebase console -> App Hosting -> `crm-test` -> Settings -> Domains. Create the DNS records it shows. Wait for the certificate to turn Active. | `https://<domain>/login` loads with a valid certificate from Firebase. |
| 8 | Set `crm-app-base-url` to `https://<domain>` (new secret version) and redeploy. | Portal test button in Settings reports reachable. |
| 9 | Catch up what arrived during the window: run Settings -> Meta -> Sync for each page, and `POST /api/leads/sync` (Property Finder) from the Leads screen. | New leads appear; no duplicates (leads are unique per source + external id). |
| 10 | Verify integrations pointing at the domain: Meta webhook verify, Property Finder webhook test, Qatar Living feed request with the API key, one `/feeds/*` URL. | Each returns success. |
| 11 | Tighten network: remove your IP from Singapore (`gcloud sql instances patch luxury-crm-sg --project=luxury-estate-crm --authorized-networks=""`). The old Doha instance still allows all IPs: remove that too (`--authorized-networks=""` on `luxury-crm-pg`). | `gcloud sql instances describe` shows no authorized networks. The site still works (connector). |
| 12 | Tell agents it is open. Watch logs (Cloud Run logs for `crm-test`) and the first hour of leads. | No error spikes. |

## 4. Smoke test list (after step 12 and again next morning)

- Login as Owner, Admin, Manager, Agent.
- Create a lead manually, change its stage, assign it, add a note and a task.
- Create a listing with 3 photos; open it on a phone.
- Open `/signup`, create a throwaway agency, confirm it is empty and cannot open a Luxury Estate lead by URL. Delete the throwaway agency afterwards.
- A Meta test lead arrives; a Property Finder lead arrives.
- Page speed: Leads list and listing detail under 2 seconds warm.

## 5. Rollback

**Before DNS is switched (steps 1-6):** nothing to undo. Production never changed. Stop, reopen the CRM, keep the old site.

**After DNS is switched (steps 7-12):**
1. Point DNS back at Vercel (keep the old records written down before step 7). With TTL 300 s this takes about 5 minutes.
2. The old site uses Supabase, which does not have anything written after `T0`.
3. Recover what was written on the new side after `T0`:
   - Find changed rows: `SELECT id FROM "Lead" WHERE "createdAt" > '<T0>'` (same for `LeadActivity`, `Listing`, `User`); and for edits to old rows `WHERE "updatedAt" > '<T0>'`.
   - New rows can be copied back with `copy-db.ts` (source Singapore, target Supabase, **without** `--wipe-target`; inserts only, existing rows are skipped), using the skip-column flag from preparation step 7.
   - **Edits to rows that already existed are not copied back automatically.** Re-apply them by hand from the `updatedAt` list. This is why the cutover window should be quiet and rollback decided within the first hour.
4. Important: the old Vercel code is the pre-multi-agency version. It works against Supabase (the migrations are backwards compatible through the temporary organization defaults, which are still in place), but it has none of the new features.
5. Do **not** run `drop_organization_defaults.sql` on Supabase until the rollback window (2 weeks) has passed.

## 6. After cutover

- Keep Vercel and Supabase running **2 weeks**, read-only in practice (the domain no longer points at Vercel, so nobody writes to Supabase).
- Day 14: take a final Supabase export and store it; pause (not delete) the Supabase project; remove the Vercel project's domain and then the project; remove old preview env vars.
- Delete the Doha instance after turning off its deletion protection: `gcloud sql instances patch luxury-crm-pg --no-deletion-protection`, then `gcloud sql instances delete luxury-crm-pg`. Do this only with your explicit OK.
- Set `ALLOW_NUMERIC_SHARE_LINKS=false` once clients have had time (suggest 30 days) to receive new-style links.
- Consider: `minInstances: 1` is already set; later consider a bigger instance (2 vCPU) and high availability if agents report slowness or you need uptime guarantees.
- Move photos out of Postgres into Cloud Storage (separate project; reduces database size and cost).

## 7. Monthly cost estimate (USD, rough; check the Google Cloud pricing calculator before relying on it)

| Item | Before (Vercel + Supabase) | After (Firebase + Cloud SQL) |
|---|---|---|
| Database | Supabase plan: *unknown, please tell me* (Free $0 / Pro $25) | Cloud SQL `db-g1-small`: about $26-37 (the sources I found disagreed; hourly $0.035-0.05) |
| Database storage + backups + PITR logs | included | about $2-5 (10 GB disk, 7 backups, 7 days of logs) |
| Hosting | Vercel plan: *unknown* (Hobby $0 / Pro $20) | App Hosting runs on Cloud Run: one always-on instance (1 CPU, 1 GB) about $8-15, plus per-request charges (small at 40-50 agents) |
| Builds, artifacts, secrets, source bucket | included | about $1-3 |
| **Total** | **$0-45 depending on plans** | **about $40-60** |

- **Correction:** earlier in this project I estimated the database at "$10-15 a month". That was too low; the real figure is about $26-37.
- **Today:** two Cloud SQL instances (Doha and Singapore) run at once, so the project is currently costing about $55-75 a month. The $10 budget alert will keep firing. It only emails; it does not stop anything. Deleting Doha (after cutover) is the single biggest saving, and a realistic budget for the final setup is **$60**.
- **Savings if cost matters more than headroom:** `db-f1-micro` is about $9-10 but has only 614 MB RAM and a low connection limit, not recommended for ~50 agents. Setting `minInstances: 0` saves ~$10 but makes the first request after idle slow and can miss Property Finder's 5-second webhook limit.
- **Cost of doing nothing:** staying on Vercel + Supabase has no migration cost. This migration saves money only if your current plans cost more than about $50 a month, so the real reasons to move are consolidation on Google, region and control, not price.

## 8. Open items that can block the date

1. Domain and DNS access (decision 1).
2. Approval to read production env values from Vercel (decision 4).
3. The `--skip-column` rollback option in `copy-db.ts` (preparation step 7).
4. Restore rehearsal done (preparation step 6).
5. A decision on what happens to leads that arrive during the window (this plan backfills them in step 9).
