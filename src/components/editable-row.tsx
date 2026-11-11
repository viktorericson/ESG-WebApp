"use client";

import { useId, useState, type ReactNode } from "react";

export function PencilIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

/** Række med et blyantikon, der folder en redigeringsformular ud under rækken */
export function EditableRow({ children, editor, editLabel }: { children: ReactNode; editor?: ReactNode; editLabel: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {children}
        {editor && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={id}
            aria-label={editLabel}
            title={editLabel}
            className={`rounded-md p-2 transition-colors ${open ? "bg-brand-50 text-brand-700" : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"}`}
          >
            <PencilIcon />
          </button>
        )}
      </div>
      {editor && open && (
        <div id={id} className="mt-4">
          {editor}
        </div>
      )}
    </>
  );
}
