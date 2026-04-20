import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { invoiceLineSchema } from "./invoice-line";

const invoiceSchema = new Schema(
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
    invoiceNumber: { type: String, required: true, trim: true },
    poNumber: { type: String, default: "" },
    issueDate: { type: Date, required: true },
    /** Set when the invoice first leaves draft (commit, or created posted). */
    postedAt: { type: Date, required: false },
    dueDate: { type: Date, required: true },
    siteAddress: { type: String, default: "" },
    currency: { type: String, default: "GBP" },
    amountNet: { type: Number, required: true },
    amountVat: { type: Number, required: true },
    amountGross: { type: Number, required: true },
    status: {
      type: String,
      enum: ["draft", "open", "partially_paid", "paid"],
      default: "draft",
      index: true,
    },
    billingFrequency: { type: String, enum: ["weekly", "monthly", ""], default: "" },
    billingPeriodLabel: { type: String, default: "" },
    pdfStoredPath: { type: String, default: "" },
    pdfOriginalName: { type: String, default: "" },
    rawExtraction: { type: Schema.Types.Mixed, default: null },
    lines: [invoiceLineSchema],
  },
  { timestamps: true }
);

invoiceSchema.index({ workspaceId: 1, customerId: 1, invoiceNumber: 1 });

export type InvoiceDoc = InferSchemaType<typeof invoiceSchema> & {
  _id: mongoose.Types.ObjectId;
};

if (process.env.NODE_ENV !== "production") {
  delete (mongoose.models as Record<string, unknown>).Invoice;
}

export const Invoice =
  mongoose.models.Invoice || mongoose.model("Invoice", invoiceSchema);
