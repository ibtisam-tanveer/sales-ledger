import { connectDb } from "@/lib/db/connect";
import { Customer } from "@/lib/models/customer";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";
import { workspaceScopeOrLegacy } from "@/lib/workspace/workspace-scope";
import { buildStatementData } from "./build-statement-data";
import { computeStatementTotals } from "./statement-math";

export type EligibleStatementCustomer = {
  customerId: string;
  name: string;
  totalDue: number;
};

/** Customers with total statement balance &gt; 0 as at `asOf` (same rules as statement rows). */
export async function listCustomersWithNonZeroStatementAsOf(
  asOf: Date
): Promise<EligibleStatementCustomer[]> {
  await connectDb();
  const workspaceId = requireWorkspaceObjectId();
  const customers = await Customer.find(workspaceScopeOrLegacy(workspaceId))
    .sort({ name: 1 })
    .select("_id name")
    .lean();

  const out: EligibleStatementCustomer[] = [];
  for (const c of customers) {
    const built = await buildStatementData(String(c._id), asOf);
    if (!built.ok) continue;
    const totals = computeStatementTotals(built.data.statementDate, built.data.rows);
    if (totals.totalDue > 0.01) {
      out.push({
        customerId: String(c._id),
        name: c.name,
        totalDue: totals.totalDue,
      });
    }
  }
  return out;
}
