import mongoose, { Schema, type InferSchemaType } from "mongoose";

const customerSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    billingAddress: { type: String, required: true, default: "" },
    externalRef: { type: String, default: "" },
    defaultCurrency: { type: String, default: "GBP" },
  },
  { timestamps: true }
);

customerSchema.index({ name: 1 });

export type CustomerDoc = InferSchemaType<typeof customerSchema> & {
  _id: mongoose.Types.ObjectId;
};

if (process.env.NODE_ENV !== "production") {
  delete (mongoose.models as Record<string, unknown>).Customer;
}

export const Customer =
  mongoose.models.Customer || mongoose.model("Customer", customerSchema);
