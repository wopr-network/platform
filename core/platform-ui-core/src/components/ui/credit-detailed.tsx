import { formatCreditDetailed } from "@/lib/format-credit";
import { cn } from "@/lib/utils";

interface CreditDetailedProps {
  value: number;
  className?: string;
}

/**
 * Renders a detailed credit value with two-tone typography:
 * - "$X.XX" portion at full opacity (text-foreground)
 * - Sub-cent digits at reduced opacity (text-muted-foreground)
 *
 * For values where detailed === standard (e.g. "$1.23"), the muted
 * portion is empty and the value renders like a normal credit display.
 */
export function CreditDetailed({ value, className }: CreditDetailedProps) {
  const formatted = formatCreditDetailed(value);
  // Split at the decimal point + 2 decimal places so only sub-cent digits are muted.
  // e.g. "$10.23" → splitAt=6, normal="$10.23", muted=""
  //      "$0.000001" → splitAt=4, normal="$0.00", muted="0001"
  const dotIndex = formatted.indexOf(".");
  const splitAt = dotIndex === -1 ? formatted.length : dotIndex + 3;
  const normal = formatted.slice(0, splitAt);
  const muted = formatted.slice(splitAt);

  return (
    <span className={cn("font-mono font-medium", className)}>
      <span>{normal}</span>
      {muted && <span className="text-muted-foreground">{muted}</span>}
    </span>
  );
}
