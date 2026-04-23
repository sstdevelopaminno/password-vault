import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-2xl text-sm font-semibold transition active:scale-[0.99] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-100 disabled:saturate-90 disabled:shadow-none disabled:[text-shadow:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/65",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--grad-main)] text-white [text-shadow:0_1px_1px_rgba(0,0,0,0.35)] shadow-[0_14px_30px_rgba(47,123,255,0.34),0_0_24px_rgba(255,62,209,0.2)] hover:brightness-110 disabled:from-slate-500 disabled:via-slate-600 disabled:to-slate-700 disabled:text-[#eff6ff]",
        secondary:
          "border border-[rgba(129,149,224,0.42)] bg-[linear-gradient(180deg,rgba(13,23,52,0.94),rgba(9,16,38,0.97))] text-[#edf5ff] shadow-[0_8px_20px_rgba(0,0,0,0.22)] hover:border-[rgba(153,176,255,0.58)] hover:bg-[linear-gradient(180deg,rgba(18,32,71,0.96),rgba(12,22,50,0.98))] hover:text-white disabled:border-[rgba(150,166,212,0.48)] disabled:bg-[linear-gradient(180deg,rgba(28,38,72,0.88),rgba(21,31,60,0.9))] disabled:text-[#cddbf7]",
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
