import { connectDb } from "@/lib/db/connect";
import { BankAccount } from "@/lib/models/bank-account";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";

export async function getBankAccount() {
  await connectDb();
  const workspaceId = requireWorkspaceObjectId();
  let doc = await BankAccount.findOne({ workspaceId, singletonKey: "default" });
  if (!doc) {
    doc = await BankAccount.create({ workspaceId, singletonKey: "default" });
  }
  return doc;
}
