"use client";

import { createContext, useCallback, useContext, useState, ReactNode } from "react";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // Red confirm button, for destructive actions (deactivate, remove, ...).
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

// Replaces window.confirm()'s generic browser dialog (which shows the raw
// URL and can't be styled) with one that matches the rest of the app.
// Usage: const confirm = useConfirm(); if (!(await confirm("..."))) return;
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ options: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    const options: ConfirmOptions = typeof opts === "string" ? { message: opts } : opts;
    return new Promise<boolean>((resolve) => setState({ options, resolve }));
  }, []);

  function handle(result: boolean) {
    state?.resolve(result);
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/50" onClick={() => handle(false)} />
          <div className="relative bg-background rounded-3xl w-full max-w-sm p-6 shadow-xl">
            {state.options.title && <h2 className="text-lg font-bold text-foreground mb-2">{state.options.title}</h2>}
            <p className="text-[15px] text-muted leading-relaxed">{state.options.message}</p>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => handle(false)}
                className="flex-1 rounded-xl py-3 text-[14px] font-semibold text-foreground bg-surface-muted active:opacity-70"
              >
                {state.options.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => handle(true)}
                className="flex-1 rounded-xl py-3 text-[14px] font-semibold text-white active:opacity-80"
                style={{ background: state.options.danger ? "var(--danger)" : "var(--primary)" }}
              >
                {state.options.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
