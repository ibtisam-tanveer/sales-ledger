import mongoose, { Schema, type InferSchemaType } from "mongoose";

const remittanceSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    /** Bank account key (singleton for now; prepared for multiple accounts). */
    bankAccountKey: { type: String, default: "default", index: true },
    receivedAt: { type: Date, required: true },
    amountGross: { type: Number, required: true },
    reference: { type: String, default: "" },
    method: { type: String, default: "" },
    unappliedAmount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export type RemittanceDoc = InferSchemaType<typeof remittanceSchema> & {
  _id: mongoose.Types.ObjectId;
};

if (process.env.NODE_ENV !== "production") {
  delete (mongoose.models as Record<string, unknown>).Remittance;
}

export const Remittance =
  mongoose.models.Remittance || mongoose.model("Remittance", remittanceSchema);
