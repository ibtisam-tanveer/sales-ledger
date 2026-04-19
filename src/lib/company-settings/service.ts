import { connectDb } from "@/lib/db/connect";
import { CompanySettings } from "@/lib/models/company-settings";
import { requireWorkspaceObjectId } from "@/lib/workspace/resolve-workspace-id";

export async function getCompanySettings() {
  await connectDb();
  const workspaceId = requireWorkspaceObjectId();
  let doc = await CompanySettings.findOne({ workspaceId, singletonKey: "default" });
  if (!doc) {
    doc = await CompanySettings.create({ workspaceId, singletonKey: "default" });
  }
  return doc;
}
