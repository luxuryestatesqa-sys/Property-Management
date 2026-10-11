"use client";

import { PAYMENT_METHOD_OPTIONS, PROJECT_STATUS_OPTIONS, paymentMethodLabel, projectStatusLabel, usesInstallments } from "@/lib/propertyFinder/saleDetails";
import { formatQAR } from "@/lib/format";

// The details Property Finder requires for every sale listing: whether it is a resale or primary
// and ready or off-plan, and how the buyer can pay.

export interface SaleDetailsValue {
  projectStatus: string;
  paymentMethods: string;
  downPayment: string;
  mortgageYears: string;
}

export const EMPTY_SALE_DETAILS: SaleDetailsValue = { projectStatus: "", paymentMethods: "", downPayment: "0", mortgageYears: "" };

// The first thing still missing, in words for the person filling the form; null when complete.
export function saleDetailsProblem(v: SaleDetailsValue): string | null {
  if (!v.projectStatus) return "Choose the project status";
  if (!v.paymentMethods) return "Choose the payment methods";
  if (usesInstallments(v.paymentMethods as never)) {
    if (v.downPayment.trim() === "") return "Enter the down payment (0 if none)";
    if (!v.mortgageYears.trim() || Number(v.mortgageYears) <= 0) return "Enter the number of years";
  }
  return null;
}

// What the API expects for these fields.
export function saleDetailsPayload(v: SaleDetailsValue) {
  const installments = usesInstallments(v.paymentMethods as never);
  return {
    projectStatus: v.projectStatus || undefined,
    paymentMethods: v.paymentMethods || undefined,
    downPayment: installments && v.downPayment.trim() !== "" ? Math.round(Number(v.downPayment)) : undefined,
    mortgageYears: installments && v.mortgageYears.trim() !== "" ? Math.round(Number(v.mortgageYears)) : undefined,
  };
}

const box = "w-full rounded-xl border bg-surface px-4 py-3.5 text-[15px] outline-none transition-colors focus:border-primary";
const label = "mb-1.5 block text-[14px] font-medium text-foreground";

function Required() {
  return <p className="mt-1.5 text-[13px] font-medium text-danger">Required</p>;
}

export default function SaleDetailsFields({ value, onChange, showErrors }: { value: SaleDetailsValue; onChange: (patch: Partial<SaleDetailsValue>) => void; showErrors?: boolean }) {
  const installments = usesInstallments(value.paymentMethods as never);
  const bad = (missing: boolean) => (showErrors && missing ? "border-danger" : "border-border");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className={label} htmlFor="sale-project-status">
          Project status <span className="text-danger">*</span>
        </label>
        <select id="sale-project-status" value={value.projectStatus} onChange={(e) => onChange({ projectStatus: e.target.value })} className={`${box} ${bad(!value.projectStatus)}`}>
          <option value="">Select an option</option>
          {PROJECT_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {showErrors && !value.projectStatus && <Required />}
      </div>

      <div>
        <div className={label}>
          Payment methods <span className="text-danger">*</span>
        </div>
        <div className={`flex gap-1 rounded-xl bg-surface-muted p-1 ${showErrors && !value.paymentMethods ? "ring-1 ring-danger" : ""}`} role="group" aria-label="Payment methods">
          {PAYMENT_METHOD_OPTIONS.map((o) => {
            const on = value.paymentMethods === o.value;
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ paymentMethods: o.value, ...(o.value === "CASH" ? {} : { downPayment: value.downPayment === "" ? "0" : value.downPayment }) })}
                className={`flex-1 rounded-lg py-2.5 text-[13px] font-medium transition-colors ${on ? "bg-surface shadow-sm" : "text-muted hover:text-foreground"}`}
                style={on ? { color: "var(--primary)" } : undefined}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        {showErrors && !value.paymentMethods && <Required />}
      </div>

      {installments && (
        <>
          <div>
            <label className={label} htmlFor="sale-down-payment">
              Down payment <span className="text-danger">*</span>
            </label>
            <div className={`flex items-center rounded-xl border bg-surface px-4 focus-within:border-primary ${bad(value.downPayment.trim() === "")}`}>
              <span className="mr-2 text-[15px] text-muted">QAR</span>
              <input id="sale-down-payment" type="number" inputMode="numeric" min="0" step="1" value={value.downPayment} onChange={(e) => onChange({ downPayment: e.target.value })} className="min-w-0 flex-1 bg-transparent py-3.5 text-[15px] outline-none" />
            </div>
            <p className="mt-1.5 text-[12.5px] text-muted">If there is no down payment required, keep the value as 0.</p>
            {showErrors && value.downPayment.trim() === "" && <Required />}
          </div>
          <div>
            <label className={label} htmlFor="sale-years">
              Number of years <span className="text-danger">*</span>
            </label>
            <input id="sale-years" type="number" inputMode="numeric" min="1" max="50" step="1" value={value.mortgageYears} onChange={(e) => onChange({ mortgageYears: e.target.value })} placeholder="e.g. 5" className={`${box} ${bad(!value.mortgageYears.trim() || Number(value.mortgageYears) <= 0)}`} />
            {showErrors && (!value.mortgageYears.trim() || Number(value.mortgageYears) <= 0) && <Required />}
          </div>
        </>
      )}
    </div>
  );
}

// A read-only summary of a saved sale listing's details (nothing for a rental or an older sale without them).
export function SaleDetailsSummary({ listing, className = "" }: { listing: { listingType: string; projectStatus: string | null; paymentMethods: string | null; downPayment: number | null; mortgageYears: number | null }; className?: string }) {
  if (listing.listingType !== "SALE") return null;
  const rows: [string, string][] = [];
  const status = projectStatusLabel(listing.projectStatus as never);
  const method = paymentMethodLabel(listing.paymentMethods as never);
  if (status) rows.push(["Project status", status]);
  if (method) rows.push(["Payment", method]);
  if (usesInstallments(listing.paymentMethods as never)) {
    if (listing.downPayment !== null) rows.push(["Down payment", listing.downPayment === 0 ? "None" : formatQAR(listing.downPayment)]);
    if (listing.mortgageYears) rows.push(["Years", `${listing.mortgageYears} year${listing.mortgageYears === 1 ? "" : "s"}`]);
  }
  if (rows.length === 0) return null;
  return (
    <dl className={`grid gap-x-6 gap-y-1.5 text-[13px] ${className}`}>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4">
          <dt className="text-muted">{k}</dt>
          <dd className="text-right font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
