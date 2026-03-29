import { z } from "zod";
import type { PinAction } from "@/lib/pin";

export const registerSchema = z
  .object({
    fullName: z.string().min(2),
    email: z.email(),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
    otp: z.string().regex(/^\d{6}$/).optional(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const signupOtpVerifySchema = z.object({
  email: z.email(),
  otp: z.string().regex(/^\d{6}$/),
});

export const resetPasswordSchema = z.object({
  email: z.email(),
  otp: z.string().regex(/^\d{6}$/),
  newPassword: z.string().min(8),
});

export const profileOtpPurposeSchema = z.enum([
  "change_email",
  "change_profile",
  "change_password",
]);

export const vaultSchema = z.object({
  title: z.string().min(1),
  username: z.string().min(1),
  secret: z.string().min(1),
  url: z.string().url().optional().or(z.literal("")),
  category: z.string().optional(),
  notes: z.string().optional(),
});

export const pinSchema = z.object({
  pin: z.string().regex(/^\d{6}$/),
});

export const pinActionSchema = z.enum([
  "view_secret",
  "copy_secret",
  "edit_secret",
  "delete_secret",
  "admin_view_vault",
  "approve_signup_request",
  "delete_signup_request",
] satisfies [PinAction, ...PinAction[]]);

export const pinVerifySchema = z.object({
  pin: z.string().regex(/^\d{6}$/),
  action: pinActionSchema,
  targetItemId: z.string().uuid().optional(),
});

export const pinSetSchema = z
  .object({
    currentPin: z.string().regex(/^\d{6}$/).optional(),
    newPin: z.string().regex(/^\d{6}$/),
    confirmPin: z.string().regex(/^\d{6}$/),
  })
  .refine((v) => v.newPin === v.confirmPin, {
    message: "PIN confirmation does not match",
    path: ["confirmPin"],
  });
