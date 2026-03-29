import { requirePinAssertion } from "@/lib/pin-guard";

// Alias middleware utility with explicit name requested by spec.
export const requireVerifiedPin = requirePinAssertion;
