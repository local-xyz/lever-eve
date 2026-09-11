import { z } from "zod";
export const enrichmentNotesSchema = z
  .array(
    z.object({
      category: z.enum(["identity", "address", "preference", "purchase"]),
      fact: z.string().min(1).max(400),
      evidence: z.enum(["observed", "inferred"]),
      sources: z
        .array(
          z.object({
            reference: z.string().min(1).max(200),
            date: z.string().max(100),
          })
        )
        .min(1)
        .max(3),
    })
  )
  .max(25);

export const enrichmentConnectionSchema = z.object({
  connector: z.string().regex(/^[a-z][a-z0-9-]{0,49}$/u),
  sourceLabel: z.string().trim().min(1).max(80),
  account: z.string().trim().min(1).max(320),
});
