import { NextResponse } from "next/server";
import {
  contentDispositionHeader,
  vatReportFilename,
} from "@/lib/format/download-filename";
import { queryVatReport } from "@/lib/reports/vat-report";
import { renderVatPdfBuffer } from "@/lib/reports/pdf/render-vat";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const customerId = searchParams.get("customerId");
    const totalsOnly =
      searchParams.get("totalsOnly") === "1" ||
      searchParams.get("totalsOnly") === "true";

    const { rows, totals } = await queryVatReport({ from, to, customerId });
    const buffer = await renderVatPdfBuffer({
      from: from ?? undefined,
      to: to ?? undefined,
      totalsOnly,
      rows,
      totals,
    });

    const filename = vatReportFilename(from, to, "pdf");
    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDispositionHeader("attachment", filename),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

