import Link from "next/link";

const tasks = [
  {
    title: "Invoice from PDF",
    desc: "Upload supplier-style PDF; check VAT and post to sales ledger.",
    href: "/upload",
    module: "Customer",
  },
  {
    title: "New invoice (manual)",
    desc: "Enter customer, amounts and dates without uploading a file.",
    href: "/invoices/new",
    module: "Customer",
  },
  {
    title: "Bank account",
    desc: "Bank details and balance; receipts from customers increase balance.",
    href: "/bank",
    module: "Bank accounts",
  },
  {
    title: "Receive money (customer)",
    desc: "Record receipt and allocate to open invoices (gross).",
    href: "/remittances",
    module: "Bank accounts",
  },
  {
    title: "Customer statements",
    desc: "Outstanding as at statement date (PDF / Excel) with preview.",
    href: "/statements",
    module: "Reports",
  },
  {
    title: "VAT summary",
    desc: "Net, VAT and gross — useful for return workings.",
    href: "/reports/vat",
    module: "Reports",
  },
  {
    title: "Customer activity",
    desc: "Ledger-style list with running balance.",
    href: "/reports/ledger",
    module: "Reports",
  },
  {
    title: "Company details (UK)",
    desc: "Registered office, company no., VAT no., logo.",
    href: "/settings/company",
    module: "Settings",
  },
];

export default function HomePage() {
  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Home
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          UK sales ledger: post PDF sales invoices, record <strong>Receive money</strong>{" "}
          against customers, and print outstanding statements. Task list on the left
          follows a <strong>Sage 50 Accounts (desktop, UK)</strong> style layout — this
          app is not Sage software.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Common tasks (UK)
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tasks.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="group rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:border-neutral-400 hover:shadow-md"
            >
              <p className="text-xs font-medium text-neutral-600">{t.module}</p>
              <p className="mt-1 font-semibold text-slate-900 group-hover:text-neutral-800">
                {t.title}
              </p>
              <p className="mt-1 text-sm text-slate-600">{t.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-slate-50/80 px-6 py-4 text-sm text-slate-700">
        <p>
          <span className="font-medium text-slate-900">Tip:</span> Use the{" "}
          <strong>Tasks</strong> list on the left (similar to Sage 50 desktop UK
          navigation) to open Customer, Bank, Reports and Settings.
        </p>
        <p className="mt-2">
          <Link href="/invoices" className="font-medium text-neutral-800 hover:underline">
            Open invoice register
          </Link>{" "}
          to see drafts and posted invoices.
        </p>
      </section>
    </div>
  );
}
