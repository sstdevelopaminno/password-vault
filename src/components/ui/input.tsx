import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-2xl border border-[var(--border-soft)] bg-[linear-gradient(180deg,rgba(31,47,104,0.9),rgba(22,35,80,0.94))] px-4 text-sm text-[#f4f8ff] outline-none transition placeholder:text-[#b2c4e7] focus:border-[var(--logo-blue)] focus:ring-4 focus:ring-[var(--ring)]",
        className,
      )}
      {...props}
    />
  );
}
