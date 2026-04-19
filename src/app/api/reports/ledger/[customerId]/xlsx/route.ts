import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db/connect";
import { Customer } from "@/lib/models/customer";
import {
  contentDispositionHeader,
  ledgerReportFilename,
} from "@/lib/format/download-filename";
import { buildLedgerExcelBuffer } from "@/lib/reports/build-ledger-excel";
import { computeLedgerReport } from "@/lib/reports/ledger-compute";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";
import { workspaceScopeOrLegacy } from "@/lib/workspace/workspace-scope";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ customerId: string }> }
) {
  try {
    await connectDb();
    const workspaceId = requireWorkspaceObjectId();
    const { customerId } = await ctx.params;
    const cust = await Customer.findOne({
      _id: customerId,
      ...workspaceScopeOrLegacy(workspaceId),
    }).lean();
    const customerName = cust?.name ?? "Customer";
    const url = new URL(req.url);
    const fromKey = url.searchParams.get("from")?.trim() || null;
    const toKey = url.searchParams.get("to")?.trim() || null;
    const isoDate = /^\d{4}-\d{2}-\d{2}$/;
    if ((fromKey && !isoDate.test(fromKey)) || (toKey && !isoDate.test(toKey))) {
      return NextResponse.json(
        { error: "Invalid date: use YYYY-MM-DD for from and to." },
        { status: 400 }
      );
    }
    if (fromKey && toKey && fromKey > toKey) {
      return NextResponse.json(
        { error: "From date must be on or before to date." },
        { status: 400 }
      );
    }

    const { lines, openingGross } = await computeLedgerReport(customerId, {
      fromKey,
      toKey,
    });

    const buffer = await buildLedgerExcelBuffer({
      customerName,
      lines,
      from: fromKey ?? undefined,
      to: toKey ?? undefined,
      openingGross:
        fromKey !== null && openingGross !== undefined ? openingGross : undefined,
    });

    const filename = ledgerReportFilename(customerName, fromKey, toKey, "xlsx");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": contentDispositionHeader("attachment", filename),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
