import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius)] border border-[var(--border-soft)] bg-[var(--card)] p-4 shadow-[0_16px_42px_rgba(0,0,0,0.34)]",
        className,
      )}
      {...props}
    />
  );
}
