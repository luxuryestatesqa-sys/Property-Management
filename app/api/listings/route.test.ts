import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const session = { user: { id: "agent-mine", role: "AGENT", status: "ACTIVE" } };
vi.mock("@/lib/api-helpers", () => ({
  requireSession: vi.fn(async () => ({ session, error: null })),
  parseJsonBody: vi.fn(async (req: NextRequest) => ({ value: await req.json(), error: null })),
}));

const listingFindMany = vi.fn();
const listingCreate = vi.fn();
const listingFindUnique = vi.fn();
const listingImageCreateMany = vi.fn();
const auditLogCreate = vi.fn();
const listingCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    listing: {
      findMany: (...args: unknown[]) => listingFindMany(...args),
      create: (...args: unknown[]) => listingCreate(...args),
      findUnique: (...args: unknown[]) => listingFindUnique(...args),
      count: (...args: unknown[]) => listingCount(...args),
    },
    listingImage: {
      createMany: (...args: unknown[]) => listingImageCreateMany(...args),
    },
    auditLog: {
      create: (...args: unknown[]) => auditLogCreate(...args),
    },
  },
}));

const { POST } = await import("./route");

function makeBody(overrides: Record<string, unknown> = {}) {
  return {
    listingType: "RENT",
    propertyCategory: "APARTMENT",
    bedrooms: "TWO",
    sizeSqm: 120,
    area: "Lusail",
    community: "Marina District",
    buildingName: "Tower 9",
    floor: "12",
    apartmentNumber: "1204",
    rentPrice: 8000,
    furnished: "FURNISHED",
    images: ["data:image/jpeg;base64,/9j/abc"],
    ownerName: "Real Owner",
    ownerPhone: "+97455500000",
    privateNotes: "Confidential arrangement",
    ...overrides,
  };
}

function req(body: Record<string, unknown>) {
  return new NextRequest(new URL("https://app.example.com/api/listings"), {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// An existing ACTIVE listing owned by a DIFFERENT agent, with private owner
// details filled in - exactly the kind of row that must never leak those
// details to the agent running the duplicate check below.
const OTHER_AGENTS_LISTING = {
  id: 7,
  createdById: "agent-other",
  dupKey: "lusail|marina district|tower 9|12|1204",
  status: "ACTIVE",
  ownerName: "The Real Owner",
  ownerPhone: "+97455511111",
  ownerWhatsapp: "+97455511112",
  titleDeedNumber: "TD-999",
  privateNotes: "Owner wants cash only, don't tell other agents",
  titleDeedImage: null,
  authorizationFormImage: null,
  createdBy: { id: "agent-other", name: "Other Agent", whatsapp: "+97455511113", avatarUrl: null },
  images: [],
};

describe("POST /api/listings - duplicate detection", () => {
  beforeEach(() => {
    listingFindMany.mockReset();
    listingCreate.mockReset();
    listingFindUnique.mockReset();
    listingImageCreateMany.mockReset();
    auditLogCreate.mockReset();
  });

  it("warns instead of creating when an ACTIVE listing already exists at the same dupKey", async () => {
    listingFindMany.mockResolvedValue([OTHER_AGENTS_LISTING]);

    const res = await POST(req(makeBody({ confirmDuplicate: false })));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.duplicate).toBe(true);
    expect(listingCreate).not.toHaveBeenCalled();
  });

  it("only checks ACTIVE listings for a duplicate match (INACTIVE never blocks a re-listing)", async () => {
    listingFindMany.mockResolvedValue([]);
    listingCreate.mockResolvedValue({ id: 99 });
    listingFindUnique.mockResolvedValue({ id: 99, images: [] });

    await POST(req(makeBody({ confirmDuplicate: false })));

    expect(listingFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: "ACTIVE" }) }));
  });

  it("never exposes another agent's private owner/title-deed details in the duplicate warning", async () => {
    listingFindMany.mockResolvedValue([OTHER_AGENTS_LISTING]);

    const res = await POST(req(makeBody({ confirmDuplicate: false })));
    const body = await res.json();

    const flagged = body.existing[0];
    expect(flagged.ownerName).toBeNull();
    expect(flagged.ownerPhone).toBeNull();
    expect(flagged.ownerWhatsapp).toBeNull();
    expect(flagged.titleDeedNumber).toBeNull();
    expect(flagged.privateNotes).toBeNull();
    // Non-private identity fields - who has it and how to reach them - are
    // the whole point of the warning, so those must still come through.
    expect(flagged.createdBy.name).toBe("Other Agent");
    expect(flagged.createdBy.whatsapp).toBe("+97455511113");
  });

  it("creates the listing anyway once the agent explicitly confirms (confirmDuplicate: true)", async () => {
    listingFindMany.mockResolvedValue([OTHER_AGENTS_LISTING]);
    listingCreate.mockResolvedValue({ id: 100 });
    listingFindUnique.mockResolvedValue({ id: 100, images: [] });

    const res = await POST(req(makeBody({ confirmDuplicate: true })));
    const body = await res.json();

    expect(body.duplicate).toBe(false);
    expect(listingCreate).toHaveBeenCalledTimes(1);
    // Confirming skips the duplicate lookup entirely - no need to re-check
    // what the agent already acknowledged.
    expect(listingFindMany).not.toHaveBeenCalled();
  });

  it("creates directly, with no warning, when no ACTIVE listing shares the dupKey", async () => {
    listingFindMany.mockResolvedValue([]);
    listingCreate.mockResolvedValue({ id: 101 });
    listingFindUnique.mockResolvedValue({ id: 101, images: [] });

    const res = await POST(req(makeBody({ confirmDuplicate: false })));
    const body = await res.json();

    expect(body.duplicate).toBe(false);
    expect(listingCreate).toHaveBeenCalledTimes(1);
  });

  it("assigns the new listing to the submitting agent, not whoever happens to already hold the same unit", async () => {
    listingFindMany.mockResolvedValue([]);
    listingCreate.mockResolvedValue({ id: 102 });
    listingFindUnique.mockResolvedValue({ id: 102, images: [] });

    await POST(req(makeBody({ confirmDuplicate: true })));

    const createArgs = listingCreate.mock.calls[0][0];
    expect(createArgs.data.createdById).toBe("agent-mine");
  });
});
