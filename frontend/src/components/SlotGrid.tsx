import { formatRemaining } from "@/lib/dates";
import type { PublicSlot } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SlotGrid({
  slots,
  closed,
  onLeave,
  selectedStartAt,
  onSelect,
  disabled,
}: {
  slots: PublicSlot[];
  closed: boolean;
  onLeave: boolean;
  selectedStartAt?: string | null;
  onSelect: (slot: PublicSlot) => void;
  disabled?: boolean;
}) {
  if (onLeave) {
    return (
      <p className="rounded-xl border border-border bg-muted/50 px-4 py-8 text-center text-sm text-muted-foreground">
        Doctor unavailable on this date.
      </p>
    );
  }

  if (closed) {
    return (
      <p className="rounded-xl border border-border bg-muted/50 px-4 py-8 text-center text-sm text-muted-foreground">
        The clinic is closed on this date. Choose a weekday.
      </p>
    );
  }

  if (slots.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        No visit times on this date.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-success" /> Available
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-warning" /> Held
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-muted-foreground/40" /> Booked
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {slots.map((slot) => {
          const selected = selectedStartAt === slot.startAt || slot.state === "HELD_BY_YOU";
          const selectable = slot.state === "AVAILABLE" || slot.state === "HELD_BY_YOU";
          return (
            <button
              key={slot.startAt}
              type="button"
              disabled={disabled || !selectable}
              onClick={() => onSelect(slot)}
              className={cn(
                "rounded-xl border px-3 py-3 text-left text-sm transition-colors motion-reduce:transition-none",
                selectable && "hover:border-accent/40 hover:bg-secondary/50",
                selected && "border-primary bg-primary text-primary-foreground shadow-soft hover:bg-primary hover:border-primary",
                slot.state === "AVAILABLE" && !selected && "border-success/30 bg-success/10",
                slot.state === "BOOKED" && "border-border bg-muted text-muted-foreground",
                slot.state === "HELD" && "border-warning/30 bg-warning/5 text-muted-foreground",
                slot.state === "UNAVAILABLE" && "border-border bg-muted text-muted-foreground",
                slot.state === "PAST" && "border-border bg-muted/40 text-muted-foreground",
              )}
            >
              <span className={cn("block font-semibold", selected && "text-primary-foreground")}>{slot.label}</span>
              <span className={cn("mt-1 block text-xs", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                {slotCaption(slot)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function slotCaption(slot: PublicSlot): string {
  if (slot.state === "AVAILABLE") return "Available";
  if (slot.state === "BOOKED") return "Booked";
  if (slot.state === "HELD_BY_YOU") {
    return slot.remainingSeconds != null ? `Reserved for you · ${formatRemaining(slot.remainingSeconds)}` : "Slot reserved for you";
  }
  if (slot.state === "HELD") {
    return slot.remainingSeconds != null ? `Held · ${formatRemaining(slot.remainingSeconds)}` : "Held";
  }
  if (slot.state === "UNAVAILABLE") return "Doctor unavailable";
  return "Past";
}
