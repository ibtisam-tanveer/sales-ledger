import { differenceInCalendarDays } from "date-fns";
import type { StatementRow } from "@/lib/statement-pdf/statement-document";

export function daysOverdue(statementDate: Date, dueDate: Date): number | null {
  if (statementDate <= dueDate) return null;
  return differenceInCalendarDays(statementDate, dueDate);
}

export function daysSinceInvoice(statementDate: Date, issueDate: Date): number | null {
  if (statementDate <= issueDate) return null;
  return differenceInCalendarDays(statementDate, issueDate);
}

/** Label for statement PDF/Excel overdue column (e.g. "78 days overdue"). */
export function formatOverdueDaysLabel(od: number | null): string {
  if (od == null) return "";
  if (od === 1) return "1 day overdue";
  return `${od} days overdue`;
}

export function computeStatementTotals(statementDate: Date, rows: StatementRow[]) {
  let totalDue = 0;
  let totalOverdue = 0;
  const aging = { b30: 0, b60: 0, b90: 0, b120: 0, b121: 0 };
  for (const r of rows) {
    totalDue += r.balanceGross;
    const d = daysOverdue(statementDate, r.dueDate);
    if (d != null && d > 0) {
      totalOverdue += r.balanceGross;
    }

    // Ageing analysis: bucket by invoice issue date (how long money has been owed).
    const age = daysSinceInvoice(statementDate, r.issueDate);
    if (age != null && age > 0) {
      if (age <= 30) aging.b30 += r.balanceGross;
      else if (age <= 60) aging.b60 += r.balanceGross;
      else if (age <= 90) aging.b90 += r.balanceGross;
      else if (age <= 120) aging.b120 += r.balanceGross;
      else aging.b121 += r.balanceGross;
    }
  }
  return { totalDue, totalOverdue, aging };
}
