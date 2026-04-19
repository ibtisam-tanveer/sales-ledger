/**
 * One-time migration: sets `workspaceId` on documents created before workspace scoping.
 * Uses the same default as `requireWorkspaceObjectId()` when WORKSPACE_ID is unset.
 *
 * Usage: MONGODB_URI=... npx tsx scripts/backfill-workspace-id.ts
 */
import mongoose from "mongoose";
import { connectDb } from "../src/lib/db/connect";
import { requireWorkspaceObjectId } from "../src/lib/workspace/resolve-workspace-id";
import { BankAccount } from "../src/lib/models/bank-account";
import { CompanySettings } from "../src/lib/models/company-settings";
import { Customer } from "../src/lib/models/customer";
import { Invoice } from "../src/lib/models/invoice";
import { PaymentAllocation } from "../src/lib/models/payment-allocation";
import { PendingInvoiceImport } from "../src/lib/models/pending-invoice-import";
import { Remittance } from "../src/lib/models/remittance";
import { SiteAddress } from "../src/lib/models/site-address";

async function main() {
  await connectDb();
  const workspaceId = requireWorkspaceObjectId();
  const filter = { workspaceId: { $exists: false } };
  const models = [
    Customer,
    Invoice,
    SiteAddress,
    BankAccount,
    CompanySettings,
    Remittance,
    PaymentAllocation,
    PendingInvoiceImport,
  ] as const;

  for (const Model of models) {
    const res = await Model.updateMany(filter, { $set: { workspaceId } });
    console.log(`${Model.collection.collectionName}: matched ${res.matchedCount}, modified ${res.modifiedCount}`);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
