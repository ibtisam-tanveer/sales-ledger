import mongoose, { Schema, type InferSchemaType } from "mongoose";

const siteAddressSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    address: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

siteAddressSchema.index({ workspaceId: 1, address: 1 }, { unique: true });

export type SiteAddressDoc = InferSchemaType<typeof siteAddressSchema> & {
  _id: mongoose.Types.ObjectId;
};

// In dev with HMR, Mongoose can keep an old compiled model (missing new schema paths).
// Clearing it ensures schema changes (e.g. adding `workspaceId`) take effect without restart.
if (process.env.NODE_ENV !== "production") {
  delete (mongoose.models as Record<string, unknown>).SiteAddress;
}

export const SiteAddress =
  mongoose.models.SiteAddress || mongoose.model("SiteAddress", siteAddressSchema);
