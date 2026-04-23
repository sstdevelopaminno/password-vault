import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-2xl text-app-body font-semibold transition active:scale-[0.99] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-100 disabled:saturate-90 disabled:shadow-none disabled:[text-shadow:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/65",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--grad-main)] text-white [text-shadow:0_1px_1px_rgba(0,0,0,0.35)] shadow-[0_14px_30px_rgba(47,123,255,0.34),0_0_24px_rgba(255,62,209,0.2)] hover:brightness-110 disabled:from-slate-500 disabled:via-slate-600 disabled:to-slate-700 disabled:text-[#eff6ff]",
        secondary:
          "border border-[rgba(154,179,255,0.34)] bg-[linear-gradient(180deg,rgba(34,50,108,0.88),rgba(22,35,80,0.92))] text-[#f3f7ff] shadow-[0_10px_24px_rgba(8,14,34,0.16)] hover:border-[rgba(174,195,255,0.48)] hover:bg-[linear-gradient(180deg,rgba(42,61,126,0.92),rgba(28,43,96,0.94))] hover:text-white disabled:border-[rgba(170,185,230,0.34)] disabled:bg-[linear-gradient(180deg,rgba(44,58,104,0.82),rgba(32,44,84,0.86))] disabled:text-[#d9e5ff]",
        destructive:
          "bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white shadow-[0_10px_24px_rgba(244,63,94,0.28)] hover:brightness-110 disabled:from-rose-400 disabled:to-fuchsia-500 disabled:text-[#fff1f6]",
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

