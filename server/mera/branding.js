import { z } from "zod";
export const brandingSchema = z
  .object({
    primary: z.string().regex(/^#[a-fA-F0-9]{6}$/),
    accent: z.string().regex(/^#[a-fA-F0-9]{6}$/),
    background: z
      .string()
      .regex(/^#[a-fA-F0-9]{6}$/)
      .optional(),
    surface: z
      .string()
      .regex(/^#[a-fA-F0-9]{6}$/)
      .optional(),
    text: z
      .string()
      .regex(/^#[a-fA-F0-9]{6}$/)
      .optional(),
    palettePreset: z
      .enum([
        "classic",
        "forest",
        "clay",
        "ocean",
        "plum",
        "midnight",
        "custom",
      ])
      .optional(),
    description: z.string().max(500),
    font: z.enum(["system", "serif", "sans"]).default("system"),
    logo: z.string().max(200).optional(),
    coverImage: z.string().max(200).optional(),
  })
  .strict();
