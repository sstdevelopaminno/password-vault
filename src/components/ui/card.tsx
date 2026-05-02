import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius)] border border-[var(--border-soft)] bg-[var(--card)] p-5 shadow-[0_16px_40px_rgba(9,15,38,0.18)]",
        className,
      )}
      {...props}
    />
  );
}
