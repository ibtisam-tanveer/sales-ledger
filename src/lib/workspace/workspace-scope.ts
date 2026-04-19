import type mongoose from "mongoose";

/**
 * Matches rows for this workspace, plus legacy documents created before `workspaceId` existed.
 * Use after schema changes or if a hot-reloaded Mongoose model omitted the field on insert.
 * Prefer running `npm run db:backfill-workspace` and relying on `workspaceId` alone for strict multi-tenant DBs.
 */
export function workspaceScopeOrLegacy(
  workspaceId: mongoose.Types.ObjectId
): { $or: [{ workspaceId: mongoose.Types.ObjectId }, { workspaceId: { $exists: false } }] } {
  return {
    $or: [{ workspaceId }, { workspaceId: { $exists: false } }],
  };
}
