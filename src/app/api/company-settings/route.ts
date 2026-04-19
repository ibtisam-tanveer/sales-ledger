import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db/connect";
import { getCompanySettings } from "@/lib/company-settings/service";

export async function GET() {
  try {
    const doc = await getCompanySettings();
    return NextResponse.json(doc);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    await connectDb();
    const body = await req.json();
    const doc = await getCompanySettings();
    if (typeof body.legalName === "string") doc.legalName = body.legalName;
    if (typeof body.logoPath === "string") doc.logoPath = body.logoPath;
    if (typeof body.registeredAddress === "string")
      doc.registeredAddress = body.registeredAddress;
    if (typeof body.companyRegistrationNumber === "string")
      doc.companyRegistrationNumber = body.companyRegistrationNumber;
    if (typeof body.vatNumber === "string") doc.vatNumber = body.vatNumber;
    if (typeof body.phone === "string") doc.phone = body.phone;
    if (typeof body.email === "string") doc.email = body.email;
    if (Array.isArray(body.invoiceImportTemplates)) {
      doc.invoiceImportTemplates = body.invoiceImportTemplates.map(
        (t: Record<string, unknown>) => ({
          id: typeof t.id === "string" ? t.id : "",
          name: typeof t.name === "string" ? t.name : "Template",
          headerRow:
            typeof t.headerRow === "number" && Number.isFinite(t.headerRow)
              ? Math.max(1, Math.floor(t.headerRow))
              : 1,
          columns:
            t.columns && typeof t.columns === "object" && t.columns !== null
              ? (t.columns as Record<string, string>)
              : {},
          defaultStatus:
            t.defaultStatus === "open" ||
            t.defaultStatus === "partially_paid" ||
            t.defaultStatus === "paid"
              ? t.defaultStatus
              : "draft",
        })
      );
    }
    await doc.save();
    return NextResponse.json(doc);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
