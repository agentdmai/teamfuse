"use client";

import { useEffect, useState } from "react";
import { readConsent, writeConsent } from "@/lib/consent";

export function CookieConsent() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (readConsent() === null) setOpen(true);
  }, []);

  if (!open) return null;

  const choose = (value: "accepted" | "declined") => {
    writeConsent(value);
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6 sm:pb-6"
    >
      <div className="mx-auto max-w-3xl rounded-lg border border-panel-700 bg-panel-800/95 p-4 shadow-xl backdrop-blur sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-relaxed text-slate-200">
            We use cookies to understand how the site is used and improve it.
            You can accept analytics cookies, or continue without them.
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => choose("declined")}
              className="rounded-md border border-panel-600 bg-panel-900 px-3 py-1.5 text-sm text-slate-200 hover:border-bolt-500 hover:text-slate-50 transition-colors"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={() => choose("accepted")}
              className="rounded-md bg-bolt-500 px-3 py-1.5 text-sm font-medium text-panel-900 hover:bg-bolt-400 transition-colors"
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
