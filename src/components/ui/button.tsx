import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-2xl text-sm font-medium transition active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-[#43d8ff] via-[#4f7bff] to-[#d946ef] text-white shadow-[0_10px_24px_rgba(79,123,255,0.3)] hover:brightness-110",
        secondary:
          "border border-[var(--border-soft)] bg-[var(--surface-2)] text-slate-800 hover:border-[var(--border-strong)] hover:bg-[rgba(231,238,255,0.95)]",
        destructive:
          "bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-[0_8px_20px_rgba(244,63,94,0.3)] hover:brightness-110",
      },
      size: {
        sm: "h-9 px-3",
        md: "h-11 px-4",
        lg: "h-12 px-5",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
