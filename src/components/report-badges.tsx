import { Badge } from "@/components/ui";
import { REPORT_STATUS_LABELS } from "@/lib/validation";

export function StatusBadge({ status }: { status: keyof typeof REPORT_STATUS_LABELS }) {
  const tone = status === "APPROVED" ? "green" : status === "IN_REVIEW" ? "amber" : "neutral";
  const icon = status === "APPROVED" ? "✓" : status === "IN_REVIEW" ? "◷" : "○";
  return <Badge tone={tone} icon={icon}>{REPORT_STATUS_LABELS[status]}</Badge>;
}

export function ModuleBadge({ module }: { module: "BASIC" | "BASIC_AND_COMPREHENSIVE" }) {
  return <Badge>{module === "BASIC" ? "B" : "B + C"}</Badge>;
}
