import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db/connect";
import { Remittance } from "@/lib/models/remittance";
import { applyRemittance } from "@/lib/allocations/apply-remittance";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";

export async function GET(req: Request) {
  try {
    await connectDb();
    const workspaceId = requireWorkspaceObjectId();
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get("customerId");
    const bankAccountKey = searchParams.get("bankAccountKey");
    const q: Record<string, unknown> = { workspaceId };
    if (customerId) q.customerId = customerId;
    if (bankAccountKey && bankAccountKey.trim()) {
      q.bankAccountKey = bankAccountKey.trim();
    }
    const list = await Remittance.find(q)
      .populate("customerId", "name")
      .sort({ receivedAt: -1 })
      .lean();
    const bankAccountKeys = await Remittance.distinct("bankAccountKey", {
      workspaceId,
    });
    const keys = (bankAccountKeys as string[])
      .filter((k) => k != null && String(k).trim() !== "")
      .map((k) => String(k).trim());
    keys.sort((a, b) => a.localeCompare(b));
    return NextResponse.json({ remittances: list, bankAccountKeys: keys });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await applyRemittance({
      customerId: body.customerId,
      bankAccountKey: typeof body.bankAccountKey === "string" ? body.bankAccountKey : undefined,
      receivedAt: new Date(body.receivedAt),
      amountGross: Number(body.amountGross),
      reference: body.reference,
      method: body.method,
      allocations: (body.allocations ?? []).map(
        (a: { invoiceId: string; amountGross: number }) => ({
          invoiceId: a.invoiceId,
          amountGross: Number(a.amountGross),
        })
      ),
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
