import { NextResponse } from "next/server";
import {
  contentDispositionHeader,
  vatReportFilename,
} from "@/lib/format/download-filename";
import { buildVatExcelBuffer } from "@/lib/reports/build-vat-excel";
import { queryVatReport } from "@/lib/reports/vat-report";

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

    const buffer = await buildVatExcelBuffer({
      rows,
      totals,
      from: from ?? undefined,
      to: to ?? undefined,
      totalsOnly,
    });

    const filename = vatReportFilename(from, to, "xlsx");
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
