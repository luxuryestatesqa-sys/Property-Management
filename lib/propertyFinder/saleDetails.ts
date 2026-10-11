import type { ProjectStatus, SalePaymentMethod } from "@prisma/client";

// Property Finder will not publish a sale listing without these, so adding a sale asks for them.
// The names and values below are Property Finder's own (price.paymentMethods / price.downpayment /
// price.numberOfMortgageYears and projectStatus in its Enterprise API).

export const PROJECT_STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "RESALE_READY", label: "Resale - Ready to move" },
  { value: "RESALE_OFF_PLAN", label: "Resale - Off-plan" },
  { value: "PRIMARY_READY", label: "Primary - Ready to move" },
  { value: "PRIMARY_OFF_PLAN", label: "Primary - Off-plan" },
];

export const PF_PROJECT_STATUS: Record<ProjectStatus, "completed" | "off_plan" | "completed_primary" | "off_plan_primary"> = {
  RESALE_READY: "completed",
  RESALE_OFF_PLAN: "off_plan",
  PRIMARY_READY: "completed_primary",
  PRIMARY_OFF_PLAN: "off_plan_primary",
};

export const PAYMENT_METHOD_OPTIONS: { value: SalePaymentMethod; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "INSTALLMENTS", label: "Installments" },
  { value: "CASH_AND_INSTALLMENTS", label: "Cash & Installments" },
];

export const PF_PAYMENT_METHODS: Record<SalePaymentMethod, ("cash" | "installments")[]> = {
  CASH: ["cash"],
  INSTALLMENTS: ["installments"],
  CASH_AND_INSTALLMENTS: ["installments", "cash"],
};

export const projectStatusLabel = (v: ProjectStatus | null | undefined) => PROJECT_STATUS_OPTIONS.find((o) => o.value === v)?.label ?? null;
export const paymentMethodLabel = (v: SalePaymentMethod | null | undefined) => PAYMENT_METHOD_OPTIONS.find((o) => o.value === v)?.label ?? null;

// A down payment and the number of years only apply when the buyer can pay by installments.
export const usesInstallments = (v: SalePaymentMethod | null | undefined) => v === "INSTALLMENTS" || v === "CASH_AND_INSTALLMENTS";

export interface SaleDetails {
  projectStatus: ProjectStatus | null;
  paymentMethods: SalePaymentMethod | null;
  downPayment: number | null;
  mortgageYears: number | null;
}

// What is still missing for a sale, in words an agent recognises. Empty when complete.
export function missingSaleDetails(d: Partial<SaleDetails>): string[] {
  const out: string[] = [];
  if (!d.projectStatus) out.push("Choose the project status");
  if (!d.paymentMethods) out.push("Choose the payment methods");
  else if (usesInstallments(d.paymentMethods)) {
    if (d.downPayment === null || d.downPayment === undefined) out.push("Enter the down payment (0 if none)");
    if (!d.mortgageYears || d.mortgageYears <= 0) out.push("Enter the number of years");
  }
  return out;
}

// The extra price fields Property Finder expects for a sale.
export function pfSalePriceExtras(d: Partial<SaleDetails>) {
  if (!d.paymentMethods) return {};
  return {
    paymentMethods: PF_PAYMENT_METHODS[d.paymentMethods],
    ...(usesInstallments(d.paymentMethods) ? { downpayment: Math.max(0, Math.round(d.downPayment ?? 0)), numberOfMortgageYears: Math.max(1, Math.round(d.mortgageYears ?? 1)) } : {}),
  };
}
