import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-2xl text-sm font-semibold transition active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/65",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--grad-main)] text-white shadow-[0_14px_30px_rgba(47,123,255,0.34),0_0_24px_rgba(255,62,209,0.2)] hover:brightness-110",
        secondary:
          "border border-[var(--border-soft)] bg-[linear-gradient(180deg,rgba(9,16,38,0.92),rgba(7,12,30,0.96))] text-[#dbe8ff] hover:border-[var(--border-strong)] hover:text-white",
        destructive:
          "bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white shadow-[0_10px_24px_rgba(244,63,94,0.28)] hover:brightness-110",
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
