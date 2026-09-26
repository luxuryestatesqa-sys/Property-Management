"use client";

import { useRef, useState } from "react";
import { resizeDocumentPhoto } from "@/lib/image";

interface DocumentPickerProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}

// Single-photo upload for a private reference document (title deed,
// authorization form) - same resize/data-URL approach as PhotoPicker, but
// only ever holds one image.
export default function DocumentPicker({ label, value, onChange }: DocumentPickerProps) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file");
      return;
    }
    setError("");
    setProcessing(true);
    try {
      onChange(await resizeDocumentPhoto(file));
    } catch {
      setError("Failed to process the photo");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div>
      <label className="text-sm font-medium text-foreground block mb-1.5">{label}</label>
      {value ? (
        <div className="relative w-full aspect-[4/3] max-w-[220px] rounded-xl overflow-hidden border border-border bg-surface-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={label} className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`Remove ${label}`}
            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center text-[12px] active:opacity-70"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={processing}
          className="w-full aspect-[4/3] max-w-[220px] rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted active:bg-surface-muted disabled:opacity-60"
        >
          {processing ? (
            <span className="w-5 h-5 rounded-full border-2 border-muted border-t-transparent animate-spin" />
          ) : (
            <>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v8M8 12h8" />
              </svg>
              <span className="text-[11px] font-medium">Add photo</span>
            </>
          )}
        </button>
      )}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelected} className="hidden" />

      {error && <p className="text-[12px] text-danger mt-1.5">{error}</p>}
    </div>
  );
}
