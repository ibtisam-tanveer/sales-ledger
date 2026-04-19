import { NextResponse } from "next/server";
import { getBankAccount } from "@/lib/bank-account/service";

export async function GET() {
  try {
    const doc = await getBankAccount();
    return NextResponse.json(doc);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const doc = await getBankAccount();
    if (typeof body.accountLabel === "string") doc.accountLabel = body.accountLabel;
    if (typeof body.bankName === "string") doc.bankName = body.bankName;
    if (typeof body.sortCode === "string") doc.sortCode = body.sortCode;
    if (typeof body.accountNumber === "string") doc.accountNumber = body.accountNumber;
    if (body.balanceGross !== undefined && Number.isFinite(Number(body.balanceGross))) {
      doc.balanceGross = Number(body.balanceGross);
    }
    await doc.save();
    return NextResponse.json(doc);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
