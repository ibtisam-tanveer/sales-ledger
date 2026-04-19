import mongoose, { Schema, type InferSchemaType } from "mongoose";

const paymentAllocationSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    remittanceId: {
      type: Schema.Types.ObjectId,
      ref: "Remittance",
      required: true,
      index: true,
    },
    invoiceId: {
      type: Schema.Types.ObjectId,
      ref: "Invoice",
      required: true,
      index: true,
    },
    amountGross: { type: Number, required: true },
  },
  { timestamps: true }
);

paymentAllocationSchema.index({ remittanceId: 1, invoiceId: 1 });

export type PaymentAllocationDoc = InferSchemaType<
  typeof paymentAllocationSchema
> & { _id: mongoose.Types.ObjectId };

if (process.env.NODE_ENV !== "production") {
  delete (mongoose.models as Record<string, unknown>).PaymentAllocation;
}

export const PaymentAllocation =
  mongoose.models.PaymentAllocation ||
  mongoose.model("PaymentAllocation", paymentAllocationSchema);
