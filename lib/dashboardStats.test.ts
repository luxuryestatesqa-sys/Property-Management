import { describe, it, expect } from "vitest";
import { portalStatus, averageMinutes, percent, formatMinutes } from "./dashboardStats";

describe("dashboard stats", () => {
  it("reads a portal status", () => {
    expect(portalStatus(null)).toBe("NOT_PUBLISHED");
    expect(portalStatus({ enabled: true, remoteListingId: "x", state: "live", lastError: null })).toBe("PUBLISHED");
    expect(portalStatus({ enabled: true, remoteListingId: "x", state: "live", lastError: "boom" })).toBe("ERROR");
    expect(portalStatus({ enabled: false, remoteListingId: "x", state: "live", lastError: null })).toBe("NOT_PUBLISHED");
  });
  it("averages response times in minutes", () => {
    expect(averageMinutes([60000, 180000])).toBe(2);
    expect(averageMinutes([])).toBeNull();
  });
  it("percent and minute formatting", () => {
    expect(percent(1, 8)).toBe(12.5);
    expect(percent(1, 0)).toBe(0);
    expect(formatMinutes(190)).toBe("3 h 10 min");
    expect(formatMinutes(null)).toBe("—");
  });
});
