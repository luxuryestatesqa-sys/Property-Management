// Clicks through the real app in a real browser as each kind of person, and checks what they can and cannot see.
// Run it against an app started on a DISPOSABLE database that scripts/e2e-seed.ts filled:
//
//   BASE_URL=http://localhost:3101 SHOTS=./shots node scripts/e2e-browser.mjs
//
// Exits with a non-zero code if any check fails. Screenshots of each screen go to SHOTS.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3101";
const SHOTS = process.env.SHOTS ?? "./e2e-shots";
const PASSWORD = "Passw0rd!";
mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  -> ${detail}`}`);
};

const browser = await chromium.launch();

async function session(email) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);
  await page.goto(`${BASE}/login`);
  await page.fill("#email", `${email}@e2e.test`);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
  return { ctx, page };
}
const visible = async (page, text) => (await page.getByText(text, { exact: false }).count()) > 0;
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
const settle = (page) => page.waitForLoadState("networkidle").catch(() => {});

try {
  // ------------------------------------------------------------------ Agent
  {
    const { ctx, page } = await session("a1");
    await settle(page);
    check("Agent: no Dashboard or Users in the menu", (await page.locator('nav a[href="/dashboard"]').count()) === 0 && (await page.locator('nav a[href="/admin/users"]').count()) === 0);
    check("Agent: menu has Properties and Leads", (await page.locator('nav a[href="/"]').count()) > 0 && (await page.locator('nav a[href="/leads"]').count()) > 0);
    await page.goto(`${BASE}/leads`);
    await settle(page);
    await page.getByText("Lead A1").first().waitFor();
    check("Agent: sees their own lead", await visible(page, "Lead A1"));
    check("Agent: does not see other agents' leads", !(await visible(page, "Lead B1")) && !(await visible(page, "Lead X0")) && !(await visible(page, "Lead Unassigned")));
    await shot(page, "agent-leads");
    await page.goto(`${BASE}/`);
    await settle(page);
    await page.getByText("Tower SharedA1").first().waitFor();
    check("Agent: sees shared listings and their own private one", (await visible(page, "Tower SharedB1")) && (await visible(page, "Tower PrivateA1")));
    check("Agent: does not see another agent's private listing", !(await visible(page, "Tower PrivateB1")));
    await shot(page, "agent-properties");
    await page.goto(`${BASE}/admin/users`);
    await settle(page);
    check("Agent: the Users page sends them away", !new URL(page.url()).pathname.startsWith("/admin"));
    await page.goto(`${BASE}/dashboard`);
    await page.waitForURL((u) => !u.pathname.startsWith("/dashboard"), { timeout: 20_000 }).catch(() => {});
    check("Agent: the dashboard sends them away", !new URL(page.url()).pathname.startsWith("/dashboard"));
    check("Agent: no Teams link in the menu", (await page.locator('nav a[href="/teams"]').count()) === 0);
    await page.goto(`${BASE}/teams`);
    await settle(page);
    check("Agent: the Teams page tells them they have no access", await visible(page, "permission"));
    await ctx.close();
  }

  // ----------------------------------------------------------- Team manager
  {
    const { ctx, page } = await session("mgra");
    await settle(page);
    check("Team manager: has Dashboard in the menu, no Users", (await page.locator('nav a[href="/dashboard"]').count()) > 0 && (await page.locator('nav a[href="/admin/users"]').count()) === 0);
    await page.goto(`${BASE}/leads`);
    await settle(page);
    await page.getByText("Lead A1").first().waitFor();
    check("Team manager: sees their team's leads", (await visible(page, "Lead A1")) && (await visible(page, "Lead A2")));
    check("Team manager: does not see another team's, an unassigned, or an unteamed lead", !(await visible(page, "Lead B1")) && !(await visible(page, "Lead X0")) && !(await visible(page, "Lead Unassigned")));
    check("Team manager: no agency-wide Assignment in the menu", (await page.locator('nav a[href="/leads/assignment"]').count()) === 0);
    await shot(page, "team-manager-leads");
    await page.goto(`${BASE}/`);
    await settle(page);
    await page.getByText("Tower SharedA1").first().waitFor();
    check("Team manager: sees their team's private listing", await visible(page, "Tower PrivateA1"));
    check("Team manager: does not see another team's private listing", !(await visible(page, "Tower PrivateB1")));
    await page.goto(`${BASE}/dashboard`);
    await settle(page);
    check("Team manager: the dashboard opens", new URL(page.url()).pathname.startsWith("/dashboard"));
    await shot(page, "team-manager-dashboard");
    await page.goto(`${BASE}/admin/users`);
    await settle(page);
    check("Team manager: the Users page sends them away", !new URL(page.url()).pathname.startsWith("/admin"));
    await page.goto(`${BASE}/`);
    await settle(page);
    check("Team manager: has a 'My team' link in the menu", (await page.locator('nav a[href="/teams"]').count()) > 0 && (await page.locator("nav").getByText("My team").count()) > 0);
    await page.locator('nav a[href="/teams"]').first().click();
    await page.waitForURL((u) => /^\/teams\/[^/]+$/.test(u.pathname), { timeout: 30_000 });
    await page.getByText("Team total").first().waitFor();
    check("Team manager: 'My team' goes straight to their team's page", await visible(page, "Sales Team A"));
    check("Team manager: sees their people with their numbers", (await visible(page, "A1 Person")) && (await visible(page, "A2 Person")) && (await visible(page, "Team manager")));
    check("Team manager: does not see another team's people on it", !(await visible(page, "B1 Person")));
    check("Team manager: can look but not add or remove people", (await page.getByRole("button", { name: "+ Add people" }).count()) === 0 && (await page.getByRole("button", { name: "Remove" }).count()) === 0);
    await shot(page, "team-manager-team-page");
    await ctx.close();
  }

  // ----------------------------------------- Manager with no team (as before)
  {
    const { ctx, page } = await session("mgrl");
    await page.goto(`${BASE}/leads`);
    await settle(page);
    await page.getByText("Lead A1").first().waitFor();
    check("Manager without a team: sees every lead, including unassigned", (await visible(page, "Lead B1")) && (await visible(page, "Lead Unassigned")) && (await visible(page, "Lead X0")));
    await page.goto(`${BASE}/`);
    await settle(page);
    await page.getByText("Tower SharedA1").first().waitFor();
    check("Manager without a team: still no other agents' private listings", !(await visible(page, "Tower PrivateA1")));
    await ctx.close();
  }

  // ----------------------------------------------------------------- Admin
  {
    const { ctx, page } = await session("admin");
    await page.goto(`${BASE}/admin/users`);
    await settle(page);
    await page.getByText("A1 PERSON", { exact: false }).first().waitFor();
    check("Admin: sees the Users page with the People and Teams switch", (await visible(page, "A1 Person")) && (await page.getByRole("tab", { name: "Teams" }).count()) > 0);
    check("Admin: each person shows their team", (await visible(page, "Sales Team A")) && (await visible(page, "Manages Sales Team A")));
    check("Admin: no 'Role permissions' button (Super Admin only)", (await page.getByRole("button", { name: "Role permissions" }).count()) === 0);
    await shot(page, "admin-users");

    await page.getByRole("tab", { name: "Teams" }).click();
    await page.getByText("Sales Team B").first().waitFor();
    check("Admin: Teams tab lists both teams with their managers", (await visible(page, "Sales Team A")) && (await visible(page, "Sales Team B")) && (await visible(page, "MGRA Person")));
    await shot(page, "admin-teams");

    // create a team
    await page.getByRole("button", { name: "+ New team" }).click();
    await page.getByRole("dialog").waitFor();
    await page.fill("#team-name", "Marketing Team");
    await page.selectOption("#team-manager", { label: "MGRL Person" });
    await page.getByRole("dialog").getByText("X0 Person").first().click();
    await shot(page, "admin-new-team");
    await page.getByRole("button", { name: "Create team" }).click();
    await page.getByText("Marketing Team").first().waitFor();
    check("Admin: creates a team with a manager and a member", (await visible(page, "Marketing Team")) && (await visible(page, "Managed by")));

    // open a team: its dashboard, and add / remove people
    await page.getByRole("tab", { name: "Teams" }).click();
    await page.locator("div.rounded-2xl", { has: page.getByRole("heading", { name: "Sales Team A" }) }).getByRole("link", { name: "Open" }).click();
    await page.waitForURL((u) => /^\/teams\/[^/]+$/.test(u.pathname), { timeout: 30_000 });
    await page.getByText("Team total").first().waitFor();
    check("Team page: shows the team name and its manager", (await visible(page, "Sales Team A")) && (await visible(page, "MGRA Person")));
    check("Team page: shows the total numbers (people, listings, leads)", (await visible(page, "People")) && (await visible(page, "Active listings")) && (await visible(page, "Leads by person")) && (await visible(page, "Active listings by person")));
    check("Team page: lists every person with their numbers", (await visible(page, "A1 Person")) && (await visible(page, "A2 Person")) && (await visible(page, "MGRA Person")));
    await shot(page, "admin-team-page");
    await page.getByRole("button", { name: "+ Add people" }).click();
    const addDlg = page.getByRole("dialog", { name: "Add people to the team" });
    await addDlg.waitFor();
    await addDlg.getByLabel("Search people").fill("X0");
    await addDlg.getByText("X0 Person").first().click();
    await shot(page, "admin-team-add-people");
    await addDlg.getByRole("button", { name: /Add 1 person/ }).click();
    await page.getByText("was added to the team").first().waitFor();
    const x0Row = page.locator("tr", { hasText: "X0 Person" });
    await x0Row.first().waitFor({ timeout: 15_000 }).catch(() => {});
    check("Team page: adds a person and they appear with their numbers", (await x0Row.count()) > 0);
    await page.locator("tr", { hasText: "X0 Person" }).getByRole("button", { name: "Remove" }).click();
    await page.getByRole("button", { name: "Remove from team" }).click();
    await page.getByText("was removed from the team").first().waitFor();
    await x0Row.first().waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
    check("Team page: removes a person from the team", (await x0Row.count()) === 0);
    await page.goto(`${BASE}/admin/users`);
    await settle(page);

    // add a user: Details / Permissions tabs
    await page.getByRole("tab", { name: "People" }).click();
    await page.getByRole("button", { name: "+ Add User" }).click();
    const dialog = page.getByRole("dialog", { name: "Add user" });
    await dialog.waitFor();
    check("Add user: has a Details tab and a Permissions tab", (await dialog.getByRole("tab", { name: "Details" }).count()) === 1 && (await dialog.getByRole("tab", { name: "Permissions" }).count()) === 1);
    check("Add user: an Admin cannot create an Admin", (await dialog.getByRole("button", { name: "Admin", exact: true }).count()) === 0);
    await dialog.getByRole("tab", { name: "Permissions" }).click();
    check("Add user: Permissions tab refuses to open until the details are filled", await visible(dialog, "Name"));
    await dialog.getByPlaceholder("Agent full name").fill("Browser Test Agent");
    await dialog.getByPlaceholder("agent@company.com").fill("browser-agent@e2e.test");
    await dialog.getByPlaceholder("e.g. +974 5000 0000").fill("+974 5000 1111");
    await dialog.getByPlaceholder("At least 6 characters").fill("secret123");
    await dialog.getByRole("button", { name: "Manager", exact: true }).click();
    await dialog.getByRole("button", { name: "Next: Permissions" }).click();
    await dialog.getByText("All leads").first().waitFor();
    const allLeads = dialog.getByRole("checkbox", { name: /All leads/ });
    check("Add user: Manager starts with the Manager template ticked (All leads)", await allLeads.isChecked());
    check("Add user: Manager does not start with Delete leads or Manage users", !(await dialog.getByRole("checkbox", { name: /Delete leads/ }).isChecked()) && !(await dialog.getByRole("checkbox", { name: /Manage users/ }).isChecked()));
    await dialog.getByRole("checkbox", { name: /Delete leads/ }).check();
    await shot(page, "admin-add-user-permissions");
    await dialog.getByRole("button", { name: "Create User" }).click();
    await page.getByText("Browser Test Agent").first().waitFor();
    check("Add user: the new person appears in the list", await visible(page, "Browser Test Agent"));
    await ctx.close();
  }

  // ----------------------------------------------------------------- Owner
  {
    const { ctx, page } = await session("owner");
    await page.goto(`${BASE}/admin/users`);
    await settle(page);
    await page.getByText("A1 PERSON", { exact: false }).first().waitFor();
    check("Super Admin: has the Role permissions button", (await page.getByRole("button", { name: "Role permissions" }).count()) > 0);
    await page.getByRole("button", { name: "Role permissions" }).click();
    const modal = page.getByRole("dialog", { name: "Role templates" });
    await modal.waitFor();
    check("Super Admin: role templates for Admin, Manager and Agent", (await modal.getByRole("tab").count()) === 0 && (await modal.getByRole("button", { name: "Admin" }).count()) > 0 && (await modal.getByRole("button", { name: "Manager" }).count()) > 0 && (await modal.getByRole("button", { name: "Agent" }).count()) > 0);
    await shot(page, "owner-role-templates");
    await modal.getByRole("button", { name: "✕" }).first().click().catch(() => {});
    await page.keyboard.press("Escape");
    await page.reload();
    await page.getByRole("button", { name: "+ Add User" }).click();
    const add = page.getByRole("dialog", { name: "Add user" });
    await add.waitFor();
    check("Super Admin: can create an Admin", (await add.getByRole("button", { name: "Admin", exact: true }).count()) === 1);
    await ctx.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
