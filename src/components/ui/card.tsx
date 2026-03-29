import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius)] border border-[var(--border-soft)] bg-[var(--card)] p-4 shadow-[0_10px_32px_rgba(30,41,59,0.1)]",
        className,
      )}
      {...props}
    />
  );
}
