"use client";

import { ALL_PERMISSIONS, PERMISSION_GROUPS, normalizePermissions, type Permission } from "@/lib/permissions";

// The list of things a Manager or Agent may be allowed to do, as tick boxes. `locked` are permissions the
// person using this screen does not have themselves: they can't hand those out, so they are shown but fixed.
export default function PermissionPicker({ value, onChange, locked = [], disabled = false }: { value: Permission[]; onChange: (next: Permission[]) => void; locked?: string[]; disabled?: boolean }) {
  function toggle(key: Permission) {
    const on = value.includes(key);
    // Taking one away also takes away what depends on it (e.g. removing "All leads" removes "Assign leads").
    const next = on ? value.filter((p) => p !== key && !normalizePermissions([p]).includes(key)) : [...value, key];
    onChange(normalizePermissions(next));
  }
  const grantable = ALL_PERMISSIONS.filter((p) => !locked.includes(p));
  const allOn = grantable.every((p) => value.includes(p));
  return (
    <div className="flex flex-col gap-4">
      {!disabled && (
        <div className="flex items-center justify-between text-[12.5px]">
          <span className="text-muted">
            {value.length} of {ALL_PERMISSIONS.length} allowed
          </span>
          <button type="button" className="font-semibold text-primary" onClick={() => onChange(allOn ? [] : normalizePermissions(grantable))}>
            {allOn ? "Clear all" : "Allow all"}
          </button>
        </div>
      )}
      {PERMISSION_GROUPS.map((g) => (
        <fieldset key={g.title} className="rounded-xl border border-border p-3">
          <legend className="px-1 text-[11.5px] font-semibold uppercase tracking-wider text-muted">{g.title}</legend>
          <ul className="flex flex-col gap-1">
            {g.items.map((item) => {
              const on = value.includes(item.key);
              const fixed = disabled || locked.includes(item.key);
              return (
                <li key={item.key}>
                  <label className={`flex items-start gap-3 rounded-lg px-2 py-2 ${fixed ? "opacity-60" : "cursor-pointer hover:bg-surface-muted"}`}>
                    <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={on} disabled={fixed} onChange={() => toggle(item.key)} />
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-medium">{item.label}</span>
                      <span className="block text-[12px] leading-snug text-muted">{item.hint}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
    </div>
  );
}
