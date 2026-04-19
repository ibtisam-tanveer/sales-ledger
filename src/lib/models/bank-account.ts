import mongoose, { Schema, type InferSchemaType } from "mongoose";

const bankAccountSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    singletonKey: { type: String, required: true, default: "default" },
    /** User-facing label e.g. "Main current account" */
    accountLabel: { type: String, default: "" },
    bankName: { type: String, default: "" },
    sortCode: { type: String, default: "" },
    accountNumber: { type: String, default: "" },
    /** Running balance increases when customer receipts are posted (gross). */
    balanceGross: { type: Number, default: 0 },
  },
  { timestamps: true }
);

bankAccountSchema.index({ workspaceId: 1, singletonKey: 1 }, { unique: true });

export type BankAccountDoc = InferSchemaType<typeof bankAccountSchema> & {
  _id: mongoose.Types.ObjectId;
};

if (process.env.NODE_ENV !== "production") {
  delete (mongoose.models as Record<string, unknown>).BankAccount;
}

export const BankAccount =
  mongoose.models.BankAccount || mongoose.model("BankAccount", bankAccountSchema);
