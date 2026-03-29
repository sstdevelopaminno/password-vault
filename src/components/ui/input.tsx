import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-2xl border border-[var(--border-soft)] bg-white/95 px-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[var(--logo-blue)] focus:ring-4 focus:ring-[var(--ring)]",
        className,
      )}
      {...props}
    />
  );
}
