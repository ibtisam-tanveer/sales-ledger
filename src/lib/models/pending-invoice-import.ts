import mongoose, { Schema, type InferSchemaType } from "mongoose";

const pendingInvoiceImportSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    pdfStoredPath: { type: String, required: true },
    pdfOriginalName: { type: String, default: "" },
    extractionText: { type: String, required: true },
    /** Serializable snapshot of ParsedInvoice (dates as ISO strings is OK). */
    parsedSnapshot: { type: Schema.Types.Mixed, required: true },
    extractedCustomerName: { type: String, default: "" },
    extractedBillingAddress: { type: String, default: "" },
    extractedExternalRef: { type: String, default: "" },
  },
  { timestamps: true }
);

export type PendingInvoiceImportDoc = InferSchemaType<
  typeof pendingInvoiceImportSchema
> & {
  _id: mongoose.Types.ObjectId;
};

if (process.env.NODE_ENV !== "production") {
  delete (mongoose.models as Record<string, unknown>).PendingInvoiceImport;
}

export const PendingInvoiceImport =
  mongoose.models.PendingInvoiceImport ||
  mongoose.model("PendingInvoiceImport", pendingInvoiceImportSchema);
