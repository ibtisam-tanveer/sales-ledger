import mongoose from "mongoose";

/** Default single-tenant workspace when `WORKSPACE_ID` is unset (valid ObjectId). */
const DEFAULT_SINGLE_TENANT_OBJECT_ID = "000000000000000000000001";

/**
 * Resolves the active workspace for server-side DB access.
 * Set `WORKSPACE_ID` in `.env` to a 24-char hex ObjectId; otherwise a fixed default is used.
 */
export function requireWorkspaceObjectId(): mongoose.Types.ObjectId {
  const raw = process.env.WORKSPACE_ID?.trim();
  const s = raw || DEFAULT_SINGLE_TENANT_OBJECT_ID;
  if (!mongoose.Types.ObjectId.isValid(s)) {
    throw new Error(
      "WORKSPACE_ID must be a 24-character hex MongoDB ObjectId when set."
    );
  }
  return new mongoose.Types.ObjectId(s);
}
