export type NavItem = { href: string; label: string };

export type NavSection = {
  id: string;
  title: string;
  subtitle?: string;
  items: NavItem[];
};

/** Single source of truth for Sage-style task list + tab labels. */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: "customer",
    title: "Customer",
    subtitle: "Sales ledger",
    items: [
      { href: "/customers", label: "Customer records" },
      { href: "/sites", label: "Site addresses" },
      { href: "/upload", label: "Invoice from PDF" },
      { href: "/invoices/new", label: "New invoice (manual)" },
      { href: "/invoices", label: "Sales invoice register" },
    ],
  },
  {
    id: "bank",
    title: "Bank accounts",
    subtitle: "Cash book",
    items: [
      { href: "/bank", label: "Bank account details" },
      { href: "/bank/activity", label: "Bank activity (receipts)" },
      { href: "/remittances", label: "Receive money (customer)" },
    ],
  },
  {
    id: "reports",
    title: "Reports",
    subtitle: "Management",
    items: [
      { href: "/statements", label: "Customer statements" },
      { href: "/reports/vat", label: "VAT summary / return data" },
      { href: "/reports/ledger", label: "Customer activity (ledger)" },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    subtitle: "Maintenance",
    items: [
      { href: "/settings/appearance", label: "Appearance & display" },
      { href: "/settings/company", label: "Company details (UK)" },
      { href: "/settings/import-templates", label: "Import templates" },
    ],
  },
];

export function navLabelForPath(pathname: string): string {
  for (const s of NAV_SECTIONS) {
    for (const item of s.items) {
      if (pathname === item.href || pathname.startsWith(item.href + "/")) {
        return item.label;
      }
    }
  }
  if (pathname === "/") return "Home";
  return pathname;
}
