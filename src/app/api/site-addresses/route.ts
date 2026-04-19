import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db/connect";
import { escapeRegex } from "@/lib/escape-regex";
import { Invoice } from "@/lib/models/invoice";
import { SiteAddress } from "@/lib/models/site-address";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";

function mergeUnique(addresses: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of addresses) {
    const t = raw.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  out.sort((a, b) => a.localeCompare(b, "en-GB"));
  return out;
}

/** Search saved site addresses and addresses from past invoices (autocomplete). */
export async function GET(req: Request) {
  try {
    await connectDb();
    const workspaceId = requireWorkspaceObjectId();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";
    if (q.length < 1) {
      return NextResponse.json([]);
    }

    const esc = escapeRegex(q);
    const re = new RegExp(esc, "i");

    const [saved, fromInvoices] = await Promise.all([
      SiteAddress.find({ workspaceId, address: re }).sort({ address: 1 }).limit(20).lean(),
      Invoice.distinct("siteAddress", {
        workspaceId,
        siteAddress: { $regex: re },
      }),
    ]);

    const fromSaved = saved.map((d) => d.address);
    const merged = mergeUnique([...fromSaved, ...(fromInvoices as string[])]);
    return NextResponse.json(merged.slice(0, 25));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Save a site address for future autocomplete (same idea as customer records). */
export async function POST(req: Request) {
  try {
    await connectDb();
    const workspaceId = requireWorkspaceObjectId();
    const body = await req.json();
    const address = typeof body.address === "string" ? body.address.trim() : "";
    if (!address) {
      return NextResponse.json({ error: "address is required" }, { status: 400 });
    }

    const doc = await SiteAddress.findOneAndUpdate(
      { workspaceId, address },
      { $setOnInsert: { workspaceId, address } },
      { upsert: true, new: true }
    ).lean();

    return NextResponse.json(doc);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
