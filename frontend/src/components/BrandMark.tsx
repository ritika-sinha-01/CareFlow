import { HeartPulse } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", inverted ? "text-primary-foreground" : "text-primary", className)}>
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg",
          inverted ? "bg-primary-foreground/12" : "border border-border/80 bg-card shadow-soft",
        )}
      >
        <HeartPulse className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="text-base font-semibold tracking-tight">CareFlow</span>
    </span>
  );
}
