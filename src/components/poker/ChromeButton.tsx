"use client";

import { D } from "@/lib/theme";

/**
 * Shared chrome button used for header chips and host mini-actions. `size`
 * picks the compact ("sm") or header ("md") metrics; `tone="danger"` paints the
 * red destructive palette.
 */
export function ChromeButton({
  label,
  onClick,
  tone,
  size = "md",
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  tone?: "danger";
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const dims = size === "sm" ? { fontSize: 10, padding: "3px 7px", borderRadius: 6 } : { fontSize: 11, padding: "6px 10px", borderRadius: 8 };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...dims,
        fontWeight: 800,
        background: tone === "danger" ? "rgba(192,96,96,0.2)" : "rgba(255,255,255,0.07)",
        border: `1px solid ${tone === "danger" ? "rgba(192,96,96,0.5)" : D.panelBorder}`,
        color: tone === "danger" ? "#f0b0b0" : D.text,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}
