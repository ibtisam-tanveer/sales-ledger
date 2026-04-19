import { connectDb } from "@/lib/db/connect";
import { Customer } from "@/lib/models/customer";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";
import { workspaceScopeOrLegacy } from "@/lib/workspace/workspace-scope";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type CustomerPickerRow = { _id: string; name: string };

/**
 * Match existing customer only (no auto-create). External ref first, then case-insensitive name.
 */
export async function resolveCustomerForImport(params: {
  name: string;
  externalRef?: string;
}): Promise<{ customerId: string } | null> {
  await connectDb();
  const workspaceId = requireWorkspaceObjectId();
  const ref = params.externalRef?.trim();
  if (ref) {
    const byRef = await Customer.findOne({
      externalRef: ref,
      ...workspaceScopeOrLegacy(workspaceId),
    }).lean();
    if (byRef) return { customerId: String(byRef._id) };
  }
  const name = params.name.trim();
  if (!name) return null;
  const byName = await Customer.findOne({
    name: { $regex: new RegExp(`^${escapeRegex(name)}$`, "i") },
    ...workspaceScopeOrLegacy(workspaceId),
  }).lean();
  if (byName) return { customerId: String(byName._id) };
  return null;
}

export async function listCustomersForPicker(limit = 800): Promise<CustomerPickerRow[]> {
  await connectDb();
  const workspaceId = requireWorkspaceObjectId();
  const rows = await Customer.find(workspaceScopeOrLegacy(workspaceId))
    .sort({ name: 1 })
    .select("_id name")
    .limit(limit)
    .lean();
  return rows.map((r) => ({ _id: String(r._id), name: r.name }));
}
