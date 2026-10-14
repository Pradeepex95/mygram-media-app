import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
});

export const createSubscriberSchema = z
  .object({
    months: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]).optional(),
    customEndDate: z.string().datetime().optional(),
    username: z
      .string()
      .trim()
      .min(3)
      .max(32)
      .regex(/^[a-zA-Z0-9_]+$/)
      .optional(),
    password: z.string().min(10).max(128).optional(),
  })
  .refine((v) => v.months || v.customEndDate, {
    message: "Provide months or customEndDate",
  });

export const extendSubscriptionSchema = z
  .object({
    months: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]).optional(),
    customEndDate: z.string().datetime().optional(),
  })
  .refine((v) => v.months || v.customEndDate, {
    message: "Provide months or customEndDate",
  });

export const statusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

export const commentSchema = z.object({
  body: z.string().trim().min(1).max(1000),
});

export const presignSchema = z.object({
  mimeType: z.string().min(3).max(100),
  sizeBytes: z.number().int().positive(),
  kind: z.enum(["media", "thumb", "avatar"]).default("media"),
});

export const createStorySchema = z.object({
  storageKey: z.string().min(1),
  mimeType: z.string().min(3),
  sizeBytes: z.number().int().positive(),
});

export const avatarSchema = z.object({
  storageKey: z.string().min(1),
});

export const completeUploadSchema = z.object({
  caption: z.string().max(2200).optional(),
  media: z
    .array(
      z.object({
        storageKey: z.string().min(1),
        thumbnailKey: z.string().optional().nullable(),
        mimeType: z.string().min(3),
        sizeBytes: z.number().int().positive(),
        width: z.number().int().positive().optional().nullable(),
        height: z.number().int().positive().optional().nullable(),
        durationSec: z.number().positive().optional().nullable(),
      }),
    )
    .min(1)
    .max(10),
});

export const feedQuerySchema = z.object({
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(20).optional(),
});

export const paginatedQuerySchema = z.object({
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(20).optional(),
});

export const subscriberQuerySchema = paginatedQuerySchema.extend({
  q: z.string().trim().max(64).optional(),
  status: z.enum(["ACTIVE", "EXPIRED", "SUSPENDED"]).optional(),
});

export const adminContentQuerySchema = paginatedQuerySchema.extend({
  type: z.enum(["posts", "comments"]).default("posts"),
});
