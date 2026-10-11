import { describe, it, expect, vi, beforeAll } from "vitest";
import { PF_PAYMENT_METHODS, PF_PROJECT_STATUS, missingSaleDetails, pfSalePriceExtras, usesInstallments } from "./saleDetails";
import { listingCreateSchema, listingUpdateSchema } from "../validation";

vi.mock("./location", () => ({ fetchPfLocationSnapshot: vi.fn() }));
vi.mock("@/lib/tenant", () => ({ tenantDb: vi.fn() }));

import { buildListingPayload, getPropertyFinderEligibility } from "./sync";

beforeAll(() => {
  process.env.APP_BASE_URL = "https://crm.example.com";
});

describe("Property Finder sale details", () => {
  it("maps the four project statuses to Property Finder's own values", () => {
    expect(PF_PROJECT_STATUS).toEqual({
      RESALE_READY: "completed",
      RESALE_OFF_PLAN: "off_plan",
      PRIMARY_READY: "completed_primary",
      PRIMARY_OFF_PLAN: "off_plan_primary",
    });
  });

  it("maps payment methods, and only installments need a down payment and years", () => {
    expect(PF_PAYMENT_METHODS.CASH).toEqual(["cash"]);
    expect(PF_PAYMENT_METHODS.CASH_AND_INSTALLMENTS).toEqual(["installments", "cash"]);
    expect(usesInstallments("CASH")).toBe(false);
    expect(usesInstallments("INSTALLMENTS")).toBe(true);
    expect(usesInstallments("CASH_AND_INSTALLMENTS")).toBe(true);
    expect(usesInstallments(null)).toBe(false);
  });

  it("lists what is still missing, in plain words", () => {
    expect(missingSaleDetails({})).toEqual(["Choose the project status", "Choose the payment methods"]);
    expect(missingSaleDetails({ projectStatus: "PRIMARY_READY", paymentMethods: "CASH" })).toEqual([]);
    expect(missingSaleDetails({ projectStatus: "PRIMARY_READY", paymentMethods: "INSTALLMENTS" })).toEqual(["Enter the down payment (0 if none)", "Enter the number of years"]);
    // a down payment of 0 is a real answer
    expect(missingSaleDetails({ projectStatus: "RESALE_OFF_PLAN", paymentMethods: "CASH_AND_INSTALLMENTS", downPayment: 0, mortgageYears: 5 })).toEqual([]);
  });

  it("builds the price extras: none for cash, down payment and years for installments", () => {
    expect(pfSalePriceExtras({ paymentMethods: "CASH", downPayment: 100, mortgageYears: 5 })).toEqual({ paymentMethods: ["cash"] });
    expect(pfSalePriceExtras({ paymentMethods: "CASH_AND_INSTALLMENTS", downPayment: 0, mortgageYears: 7 })).toEqual({ paymentMethods: ["installments", "cash"], downpayment: 0, numberOfMortgageYears: 7 });
    expect(pfSalePriceExtras({})).toEqual({});
  });
});

describe("a sale cannot be added without them", () => {
  const base = {
    listingType: "SALE" as const,
    propertyCategory: "APARTMENT" as const,
    bedrooms: "TWO" as const,
    sizeSqm: 120,
    area: "Lusail",
    community: "Marina District",
    buildingName: "T1",
    floor: "3",
    apartmentNumber: "301",
    salePrice: 1500000,
    furnished: "FURNISHED" as const,
    images: ["data:image/jpeg;base64,/9j/4AAQSkZJRg=="],
  };
  const issues = (data: object) => {
    const r = listingCreateSchema.safeParse({ ...base, ...data });
    return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
  };

  it("requires the project status and payment methods", () => {
    expect(issues({})).toEqual(expect.arrayContaining(["projectStatus", "paymentMethods"]));
    expect(issues({ projectStatus: "PRIMARY_READY", paymentMethods: "CASH" })).toEqual([]);
  });

  it("with installments also requires a down payment (0 allowed) and the years", () => {
    expect(issues({ projectStatus: "PRIMARY_READY", paymentMethods: "INSTALLMENTS" })).toEqual(expect.arrayContaining(["downPayment", "mortgageYears"]));
    expect(issues({ projectStatus: "PRIMARY_READY", paymentMethods: "INSTALLMENTS", downPayment: 0, mortgageYears: 5 })).toEqual([]);
    expect(issues({ projectStatus: "PRIMARY_READY", paymentMethods: "INSTALLMENTS", downPayment: -1, mortgageYears: 5 })).toContain("downPayment");
    expect(issues({ projectStatus: "PRIMARY_READY", paymentMethods: "INSTALLMENTS", downPayment: 10, mortgageYears: 99 })).toContain("mortgageYears");
  });

  it("does not ask a rental for them, and editing an older sale without them is still allowed", () => {
    expect(issues({ listingType: "RENT", salePrice: undefined, rentPrice: 7000 })).toEqual([]);
    expect(listingUpdateSchema.safeParse({ title: "New title" }).success).toBe(true);
  });
});

describe("publishing a sale to Property Finder", () => {
  const ready = { title: "t", description: "d", bathrooms: "2", propertyCategory: "APARTMENT" as const, pfLocationId: 1, listingType: "SALE" as const, rentPrice: null, salePrice: 900000 };

  it("is blocked until the sale details are filled in, then allowed", () => {
    const blocked = getPropertyFinderEligibility(ready, [{ id: "a" }], 7);
    expect(blocked.eligible).toBe(false);
    expect(blocked.reasons).toEqual(expect.arrayContaining(["Choose the project status", "Choose the payment methods"]));
    expect(getPropertyFinderEligibility({ ...ready, projectStatus: "RESALE_READY", paymentMethods: "CASH" }, [{ id: "a" }], 7).eligible).toBe(true);
  });

  it("a rental never needs them", () => {
    expect(getPropertyFinderEligibility({ ...ready, listingType: "RENT", rentPrice: 5000 }, [{ id: "a" }], 7).eligible).toBe(true);
  });

  const listing = (extra: object) =>
    ({ id: 9, listingType: "SALE", propertyCategory: "APARTMENT", bedrooms: "TWO", bathrooms: "2", sizeSqm: 100, title: "T", description: "D", titleAr: null, descriptionAr: null, amenities: [], pfLocationId: 5, furnished: "FURNISHED", rentPrice: null, salePrice: 1250000.4, updatedAt: new Date(), images: [{ id: "i1" }], ...extra }) as never;

  it("sends projectStatus and the price extras exactly as Property Finder expects", () => {
    const payload = buildListingPayload(listing({ projectStatus: "PRIMARY_OFF_PLAN", paymentMethods: "CASH_AND_INSTALLMENTS", downPayment: 0, mortgageYears: 5 }), 11, 22, "LE-9");
    expect(payload.projectStatus).toBe("off_plan_primary");
    expect(payload.price).toEqual({ type: "sale", amounts: { sale: 1250000 }, paymentMethods: ["installments", "cash"], downpayment: 0, numberOfMortgageYears: 5 });
  });

  it("cash only sends no down payment or years; a rental sends none of it", () => {
    const cash = buildListingPayload(listing({ projectStatus: "RESALE_READY", paymentMethods: "CASH", downPayment: 5000, mortgageYears: 3 }), 11, 22, "LE-9");
    expect(cash.projectStatus).toBe("completed");
    expect(cash.price).toEqual({ type: "sale", amounts: { sale: 1250000 }, paymentMethods: ["cash"] });
    const rent = buildListingPayload(listing({ listingType: "RENT", rentPrice: 7000, salePrice: null, projectStatus: "RESALE_READY", paymentMethods: "CASH" }), 11, 22, "LE-9");
    expect(rent.projectStatus).toBeUndefined();
    expect(rent.price).toEqual({ type: "monthly", amounts: { monthly: 7000 } });
  });
});
