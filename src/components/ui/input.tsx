import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-2xl border border-[var(--border-soft)] bg-[linear-gradient(180deg,rgba(8,15,36,0.94),rgba(6,12,29,0.96))] px-4 text-sm text-[#f0f6ff] outline-none transition placeholder:text-[#8da0c9] focus:border-[var(--logo-blue)] focus:ring-4 focus:ring-[var(--ring)]",
        className,
      )}
      {...props}
    />
  );
}
