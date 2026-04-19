import { NextResponse } from "next/server";
import {
  customersCsvTemplate,
  customersXlsxBuffer,
  salesInvoicesCsvTemplate,
  salesInvoicesXlsxBuffer,
} from "@/lib/settings/import-template-files";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const kind = searchParams.get("kind");
    const format = searchParams.get("format");

    if (kind === "customers" && format === "csv") {
      const body = customersCsvTemplate();
      return new NextResponse(body, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="customers-import-template.csv"',
        },
      });
    }

    if (kind === "customers" && format === "xlsx") {
      const buf = await customersXlsxBuffer();
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition":
            'attachment; filename="customers-import-template.xlsx"',
        },
      });
    }

    if (kind === "sales-invoices" && format === "csv") {
      const body = salesInvoicesCsvTemplate();
      return new NextResponse(body, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="sales-invoices-import-template.csv"',
        },
      });
    }

    if (kind === "sales-invoices" && format === "xlsx") {
      const buf = await salesInvoicesXlsxBuffer();
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition":
            'attachment; filename="sales-invoices-import-template.xlsx"',
        },
      });
    }

    return NextResponse.json(
      {
        error:
          "Use ?kind=customers|sales-invoices&format=csv|xlsx",
      },
      { status: 400 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
