import { cache } from "react";
import { prisma } from "./prisma";

export interface OrgBranding {
  id: string;
  name: string;
  logoUrl: string | null;
  brandColor: string | null;
}

// What the signed-in agency looks like (name, logo, colour). Cached per
// request so the layout and any page can ask without extra queries.
export const getOrgBranding = cache(async (orgId: string): Promise<OrgBranding | null> => {
  return prisma.organization.findUnique({ where: { id: orgId }, select: { id: true, name: true, logoUrl: true, brandColor: true } });
});

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isValidBrandColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

// A lighter shade of the brand colour for hovers and accents (mixes with white).
export function lighten(hex: string, amount = 0.25): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "agency";
}
