import { describe, it, expect } from "vitest";
import { getPfStatus } from "./status";

const s = (state: string | null, enabled = false, remoteListingId: string | null = "abc") => getPfStatus({ state, enabled, remoteListingId });

describe("getPfStatus", () => {
  it("is not published when nothing was ever sent to Property Finder", () => {
    expect(getPfStatus(null).kind).toBe("not_published");
    expect(s("live", true, null).kind).toBe("not_published");
  });

  it("treats live as published even if this app's own flag is false", () => {
    const v = s("live", false);
    expect(v.kind).toBe("live");
    expect(v.active).toBe(true);
  });

  it("treats pending_publishing as publishing (active)", () => {
    expect(s("pending_publishing", true)).toMatchObject({ kind: "publishing", active: true });
  });

  it("never reports failed / taken-down listings as published, even if the flag is true", () => {
    expect(s("publishing_failed", true)).toMatchObject({ kind: "failed", active: false });
    expect(s("takendown", true)).toMatchObject({ kind: "failed", active: false });
  });

  it("reports draft / unpublished / archived as not live", () => {
    for (const st of ["draft", "unpublished", "archived"]) {
      expect(s(st, true)).toMatchObject({ kind: "not_live", active: false });
    }
  });

  it("falls back to the agent's intent for an unknown stage", () => {
    expect(s(null, true)).toMatchObject({ kind: "publishing", active: true });
    expect(s("something_new", false)).toMatchObject({ kind: "not_live", active: false });
  });
});
