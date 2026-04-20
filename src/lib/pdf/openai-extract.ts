import OpenAI from "openai";
import { z } from "zod";
import type { ParsedInvoice, ParsedLine } from "./parse-facility";

const responseSchema = z.object({
  invoiceNumber: z.string(),
  issueDateIso: z.string().nullable(),
  poNumber: z.string().optional().default(""),
  siteAddress: z.string().optional().default(""),
  customerName: z.string().optional().default(""),
  customerAddressLines: z.array(z.string()).optional().default([]),
  customerExternalId: z.string().optional().default(""),
  lines: z
    .array(
      z.object({
        shiftDate: z.string(),
        description: z.string(),
        unitPrice: z.number(),
        totalHours: z.number(),
      })
    )
    .default([]),
  amountNet: z.number(),
  amountVat: z.number(),
  amountGross: z.number(),
});

export async function extractInvoiceWithOpenAI(
  pdfText: string
): Promise<ParsedInvoice | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const client = new OpenAI({ apiKey: key });
  const sys = `You extract structured data from UK facility/cleaning service invoice text.
Return ONLY valid JSON matching the schema. Dates: parse to ISO yyyy-MM-dd if possible else null.
Amounts are decimal numbers in GBP. PO number empty string if absent.
The PDF often has two separate columns labelled "Site" and "P.O. NUMBER": put ONLY the site/venue/address (and postcode) in siteAddress, and ONLY the purchase-order / job reference (e.g. 2.00.22.1169) in poNumber — never put the site name or address in poNumber.`;

  const user = `Extract from this invoice text:\n\n${pdfText.slice(0, 12000)}`;

  const res = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: sys },
      {
        role: "user",
        content:
          user +
          `\n\nJSON shape: { "invoiceNumber", "issueDateIso", "poNumber", "siteAddress", "customerName", "customerAddressLines", "customerExternalId", "lines": [{ "shiftDate", "description", "unitPrice", "totalHours" }], "amountNet", "amountVat", "amountGross" }`,
      },
    ],
    temperature: 0,
  });

  const raw = res.choices[0]?.message?.content;
  if (!raw) return null;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  const parsed = responseSchema.safeParse(data);
  if (!parsed.success) return null;

  const d = parsed.data;
  const issueDate = d.issueDateIso ? new Date(d.issueDateIso) : null;

  const lines: ParsedLine[] = d.lines.map((l) => ({
    shiftDate: l.shiftDate,
    description: l.description,
    unitPrice: l.unitPrice,
    totalHours: l.totalHours,
  }));

  return {
    invoiceNumber: d.invoiceNumber,
    issueDate: issueDate && !isNaN(issueDate.getTime()) ? issueDate : null,
    poNumber: d.poNumber,
    siteAddress: d.siteAddress,
    customerName: d.customerName,
    customerAddressLines: d.customerAddressLines,
    customerExternalId: d.customerExternalId,
    lines,
    amountNet: d.amountNet,
    amountVat: d.amountVat,
    amountGross: d.amountGross,
  };
}
