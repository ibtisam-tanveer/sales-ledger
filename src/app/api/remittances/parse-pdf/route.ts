import { NextResponse } from "next/server";
import { extractPdfText } from "@/lib/pdf/extract-text";
import {
  extractRemittanceFromText,
  normaliseInvoiceNo,
} from "@/lib/pdf/remittance-openai";
import { listOpenInvoicesWithBalances } from "@/lib/invoices/open-for-allocation";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const customerId = form.get("customerId");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }
    if (typeof customerId !== "string" || !customerId) {
      return NextResponse.json({ error: "customerId required" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const { text } = await extractPdfText(buf);

    const parsed = await extractRemittanceFromText(text);
    if (!parsed) {
      if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json(
          {
            error:
              "Could not read remittance — set OPENAI_API_KEY for varying remittance layouts.",
            textPreview: text.slice(0, 1500),
          },
          { status: 422 }
        );
      }
      return NextResponse.json(
        {
          error: "Could not extract structured data from remittance PDF.",
          textPreview: text.slice(0, 1500),
        },
        { status: 422 }
      );
    }

    const openInv = await listOpenInvoicesWithBalances(customerId);
    const byNorm = new Map(
      openInv.map((i) => [normaliseInvoiceNo(i.invoiceNumber), i])
    );

    const perInvoice = new Map<string, number>();
    const unmatched: { invoiceNumber: string; amount: number }[] = [];

    for (const line of parsed.lines) {
      if (line.amount <= 0) continue;
      const key = normaliseInvoiceNo(line.invoiceNumber);
      const inv = byNorm.get(key);
      if (!inv) {
        unmatched.push({ invoiceNumber: line.invoiceNumber, amount: line.amount });
        continue;
      }
      const id = inv._id.toString();
      const prev = perInvoice.get(id) ?? 0;
      const room = Math.max(0, inv.balanceGross - prev);
      const add = Math.min(line.amount, room + 0.001);
      if (add > 0) perInvoice.set(id, Math.round((prev + add) * 100) / 100);
    }

    const allocations = [...perInvoice.entries()].map(([invoiceId, amountGross]) => ({
      invoiceId,
      amountGross,
      matched: true,
    }));

    const allocSum = allocations.reduce((s, a) => s + a.amountGross, 0);
    let totalGross = parsed.totalGross ?? allocSum;
    if (totalGross < allocSum - 0.02) {
      totalGross = allocSum;
    }

    return NextResponse.json({
      totalGross: Math.round(totalGross * 100) / 100,
      reference: parsed.reference,
      paymentDateIso: parsed.paymentDateIso,
      allocations,
      unmatched,
      rawLineCount: parsed.lines.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    console.error(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
