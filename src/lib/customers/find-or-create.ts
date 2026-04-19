import { connectDb } from "@/lib/db/connect";
import { Customer } from "@/lib/models/customer";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";
import { workspaceScopeOrLegacy } from "@/lib/workspace/workspace-scope";

/** @deprecated PDF upload no longer auto-creates customers; kept for any legacy callers. */
export async function findOrCreateCustomer(params: {
  name: string;
  billingAddress: string;
  externalRef?: string;
}) {
  await connectDb();
  const workspaceId = requireWorkspaceObjectId();
  const name = params.name.trim();
  if (!name) {
    throw new Error("Customer name is required");
  }

  if (params.externalRef) {
    const existing = await Customer.findOne({
      externalRef: params.externalRef,
      ...workspaceScopeOrLegacy(workspaceId),
    });
    if (existing) return existing;
  }

  let c = await Customer.findOne({ name, ...workspaceScopeOrLegacy(workspaceId) });
  if (!c) {
    c = await Customer.create({
      workspaceId,
      name,
      billingAddress: params.billingAddress,
      externalRef: params.externalRef ?? "",
    });
  } else if (params.billingAddress && !c.billingAddress) {
    c.billingAddress = params.billingAddress;
    await c.save();
  }
  if (params.externalRef && !c.externalRef) {
    c.externalRef = params.externalRef;
    await c.save();
  }
  return c;
}
