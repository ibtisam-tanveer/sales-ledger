import OpenAI from "openai";
import { z } from "zod";

const schema = z.object({
  totalGross: z.number().nullable(),
  reference: z.string().optional().default(""),
  paymentDateIso: z.string().nullable().optional(),
  lines: z
    .array(
      z.object({
        invoiceNumber: z.string(),
        amount: z.number(),
        description: z.string().optional().default(""),
      })
    )
    .default([]),
});

export type ParsedRemittance = z.infer<typeof schema>;

/**
 * Extract remittance / payment advice details from arbitrary PDF text.
 * Layouts differ by customer — LLM handles variation when OPENAI_API_KEY is set.
 */
export async function extractRemittanceFromText(
  pdfText: string
): Promise<ParsedRemittance | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const client = new OpenAI({ apiKey: key });
  const sys = `You read UK customer remittance advice, BACS remittance emails, or payment listing PDFs.
Extract: total payment amount in GBP if stated, bank/reference text, payment date if any, and each line that allocates to an invoice (invoice number or sales invoice ref as shown, and amount in GBP).
Invoice numbers may look like 01819/26 or 01271/25. Return strict JSON only.`;

  const user = `Text from document:\n\n${pdfText.slice(0, 14000)}`;

  const res = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: sys },
      {
        role: "user",
        content:
          user +
          `\n\nJSON: { "totalGross": number|null, "reference": string, "paymentDateIso": string|null, "lines": [{ "invoiceNumber": string, "amount": number, "description": string }] }`,
      },
    ],
    temperature: 0,
  });

  const raw = res.choices[0]?.message?.content;
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const p = schema.safeParse(data);
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}

/** Normalise invoice numbers for matching (strip spaces, compare case-insensitive). */
export function normaliseInvoiceNo(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}
