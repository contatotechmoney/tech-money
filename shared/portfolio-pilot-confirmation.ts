import { z } from "zod";

/** Public results only. Never include subjects, email addresses, digests or tokens. */
export type PortfolioAccountConfirmation = {
  environment: "production" | "development";
  officialSession: "verified" | "inactive" | "unavailable" | "production_required";
  primaryEmail: "verified" | "unverified" | "unavailable" | "production_required";
  ownerMatch: "matches" | "different" | "reference_unavailable" | "unavailable" | "production_required";
  checkedAt: string;
  ownerBound: false;
  accessGranted: false;
  executable: false;
};

export const confirmationResponseSchema = z.object({
  environment: z.enum(["production", "development"]),
  officialSession: z.enum(["verified", "inactive", "unavailable", "production_required"]),
  primaryEmail: z.enum(["verified", "unverified", "unavailable", "production_required"]),
  ownerMatch: z.enum(["matches", "different", "reference_unavailable", "unavailable", "production_required"]),
  checkedAt: z.string().datetime(),
  ownerBound: z.literal(false), accessGranted: z.literal(false), executable: z.literal(false),
}).strict();

/** A binding is not approval of an execution, model, tariff or budget. */
export const ownerBindingConsentSchema = z.object({
  confirmExclusiveOwner: z.literal(true),
}).strict();

export const ownerBindingStateSchema = z.object({
  environment: z.literal("production"),
  ownerBound: z.boolean(),
  revoked: z.boolean(),
  auditRecorded: z.boolean(),
  executable: z.literal(false),
}).strict();

export const ownerBindingAppliedSchema = ownerBindingStateSchema.extend({
  ownerBound: z.literal(true),
  revoked: z.literal(false),
  auditRecorded: z.literal(true),
}).strict();

export type OwnerBindingState = z.infer<typeof ownerBindingStateSchema>;
