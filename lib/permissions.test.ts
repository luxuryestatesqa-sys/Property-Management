import { describe, it, expect } from "vitest";
import { ALL_PERMISSIONS, DEFAULT_PERMISSIONS, can, effectivePermissions, normalizePermissions, templateFor } from "./permissions";

describe("permissions", () => {
  it("only the Owner (the Super Admin) always has everything, whatever is saved", () => {
    expect(effectivePermissions("OWNER", [], null)).toEqual(ALL_PERMISSIONS);
    expect(effectivePermissions("OWNER", ["leads.viewAll"], { MANAGER: [] })).toEqual(ALL_PERMISSIONS);
    expect(can({ role: "OWNER", permissions: [] }, "users.manage")).toBe(true);
  });

  it("an Admin has everything by default (as Admins did before) but can be restricted", () => {
    expect(effectivePermissions("ADMIN", null, null)).toEqual(ALL_PERMISSIONS);
    expect(effectivePermissions("ADMIN", ["dashboard.view"], null)).toEqual(["dashboard.view"]);
    expect(effectivePermissions("ADMIN", null, { ADMIN: ["leads.viewAll"] })).toEqual(["leads.viewAll"]);
    expect(can({ role: "ADMIN", permissions: ["dashboard.view"] }, "users.manage")).toBe(false);
  });

  it("a Manager with nothing saved keeps what Managers could do before permissions were configurable", () => {
    const p = effectivePermissions("MANAGER", null, null);
    expect(p).toEqual(expect.arrayContaining(["dashboard.view", "leads.viewAll", "leads.assign", "activities.viewAll", "viewings.manageAll", "owners.viewAll"]));
    for (const never of ["leads.delete", "leads.stages", "leads.rules", "listings.viewAll", "listings.editAll", "users.manage", "settings.agency", "settings.integrations"]) {
      expect(p).not.toContain(never);
    }
  });

  it("an Agent has none of the extra permissions", () => {
    expect(effectivePermissions("AGENT", null, null)).toEqual([]);
  });

  it("a person's own saved list wins over the agency template", () => {
    expect(effectivePermissions("AGENT", ["dashboard.view"], { AGENT: ["leads.viewAll"] })).toEqual(["dashboard.view"]);
    expect(effectivePermissions("AGENT", null, { AGENT: ["leads.viewAll"] })).toEqual(["leads.viewAll"]);
  });

  it("an empty saved list means nothing allowed, not 'follow the template'", () => {
    expect(effectivePermissions("MANAGER", [], null)).toEqual([]);
  });

  it("ignores unknown keys and adds what a permission depends on", () => {
    expect(normalizePermissions(["leads.assign", "made.up", 7, null])).toEqual(["leads.viewAll", "leads.assign"]);
    expect(normalizePermissions("leads.assign")).toEqual([]);
    expect(normalizePermissions(["listings.editAll"])).toContain("listings.viewAll");
  });

  it("can() is false without a user or without the permission", () => {
    expect(can(null, "dashboard.view")).toBe(false);
    expect(can({ role: "MANAGER", permissions: ["dashboard.view"] }, "dashboard.view")).toBe(true);
    expect(can({ role: "MANAGER", permissions: ["dashboard.view"] }, "users.manage")).toBe(false);
    expect(can({ role: "AGENT" }, "dashboard.view")).toBe(false);
  });

  it("falls back to the built-in defaults when the template is missing or malformed", () => {
    expect(templateFor("MANAGER", { MANAGER: "nope" })).toEqual(DEFAULT_PERMISSIONS.MANAGER);
    expect(templateFor("AGENT", undefined)).toEqual([]);
  });
});
