import { z } from 'zod';
import type { PinAction } from '@/lib/pin';

export const registerSchema = z
 .object({
 fullName: z.string().min(2),
 email: z.email(),
 password: z.string().min(8),
 confirmPassword: z.string().min(8),
 otp: z.string().regex(/^\d{6}$/).optional(),
 })
 .refine((v) => v.password === v.confirmPassword, {
 message: 'Passwords do not match',
 path: ['confirmPassword'],
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

export const profileOtpPurposeSchema = z.enum(['change_email', 'change_profile', 'change_password']);

export const vaultSchema = z.object({
 title: z.string().min(1),
 username: z.string().min(1),
 secret: z.string().min(1),
 url: z.string().url().optional().or(z.literal('')),
 category: z.string().optional(),
 notes: z.string().optional(),
});

export const teamRoomCreateSchema = z.object({
 name: z.string().trim().min(1).max(80),
 description: z.string().trim().max(500).optional().or(z.literal('')),
});

export const teamRoomUpdateSchema = z.object({
 name: z.string().trim().min(1).max(80),
 description: z.string().trim().max(500).optional().or(z.literal('')),
});

export const teamRoomShareMemberSchema = z.object({
 email: z.email().transform((value) => value.trim().toLowerCase()),
});

export const teamRoomMoveItemSchema = z.object({
 targetRoomId: z.uuid(),
});

export const teamRoomMessageSchema = z.object({
 body: z.string().trim().min(1).max(4000),
});

export const teamRoomShareSchema = z.object({
 vaultItemId: z.string().uuid(),
 note: z.string().trim().max(500).optional().or(z.literal('')),
});

const isoDateTimeNullable = z
 .string()
 .datetime({ offset: true })
 .nullable()
 .optional()
 .transform((value) => value ?? null);

export const noteCreateSchema = z.object({
 title: z.string().trim().min(1).max(140),
 content: z.string().trim().min(1).max(20000),
 reminderAt: isoDateTimeNullable,
 meetingAt: isoDateTimeNullable,
});

export const noteUpdateSchema = z.object({
 title: z.string().trim().min(1).max(140),
 content: z.string().trim().min(1).max(20000),
 reminderAt: isoDateTimeNullable,
 meetingAt: isoDateTimeNullable,
});

const billingLineSchema = z.object({
 description: z.string().trim().min(1).max(240),
 qty: z.coerce.number().min(0).max(1_000_000),
 unitPrice: z.coerce.number().min(0).max(1_000_000_000),
});

const dateOnlySchema = z
 .string()
 .regex(/^\d{4}-\d{2}-\d{2}$/);

export const billingDocumentCreateSchema = z.object({
 docKind: z.enum(['receipt', 'invoice']),
 template: z.enum(['a4', '80mm']),
 documentNo: z.string().trim().min(1).max(80),
 referenceNo: z.string().trim().max(80).optional().or(z.literal('')),
 issueDate: dateOnlySchema,
 dueDate: dateOnlySchema.nullable().optional().or(z.literal('')).transform((value) => value || null),
 sellerName: z.string().trim().min(1).max(140),
 sellerAddress: z.string().trim().max(400).optional().or(z.literal('')),
 sellerTaxId: z.string().trim().max(80).optional().or(z.literal('')),
 buyerName: z.string().trim().min(1).max(140),
 buyerAddress: z.string().trim().max(400).optional().or(z.literal('')),
 buyerTaxId: z.string().trim().max(80).optional().or(z.literal('')),
 contactName: z.string().trim().max(120).optional().or(z.literal('')),
 contactPhone: z.string().trim().max(60).optional().or(z.literal('')),
 paymentMethod: z.string().trim().max(80).optional().or(z.literal('')),
 noteMessage: z.string().trim().max(1000).optional().or(z.literal('')),
 discountPercent: z.coerce.number().min(0).max(100).optional().default(0),
 vatPercent: z.coerce.number().min(0).max(100).optional().default(7),
 currency: z.string().trim().min(1).max(12).optional().default('THB'),
 lines: z.array(billingLineSchema).min(1).max(200),
 emailTo: z.email().optional().or(z.literal('')).transform((value) => value ?? ''),
 emailMessage: z.string().trim().max(1000).optional().or(z.literal('')).transform((value) => value ?? ''),
});

export const billingEmailQueueCreateSchema = z.object({
 documentId: z.uuid(),
 toEmail: z.email(),
 scheduledAt: z.string().datetime({ offset: true }),
 message: z.string().trim().max(1000).optional().or(z.literal('')),
});

export const supportTicketCreateSchema = z.object({
 category: z.enum(['general', 'account', 'security', 'team']).default('general'),
 priority: z.enum(['low', 'normal', 'high']).default('normal'),
 subject: z.string().trim().min(3).max(140),
 message: z.string().trim().min(10).max(4000),
});

export const pinSchema = z.object({
 pin: z.string().regex(/^\d{6}$/),
});

export const pinActionSchema = z.enum(
 ['view_secret', 'copy_secret', 'edit_secret', 'delete_secret', 'admin_view_vault', 'approve_signup_request', 'delete_signup_request', 'unlock_app'] satisfies [PinAction, ...PinAction[]],
);

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
 message: 'PIN confirmation does not match',
 path: ['confirmPin'],
 });
