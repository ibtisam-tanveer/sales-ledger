import mongoose, { Schema, type InferSchemaType } from "mongoose";

const invoiceImportTemplateSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    headerRow: { type: Number, default: 1 },
    columns: { type: Schema.Types.Mixed, default: {} },
    defaultStatus: {
      type: String,
      enum: ["draft", "open", "partially_paid", "paid"],
      default: "draft",
    },
  },
  { _id: false }
);

const companySettingsSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    singletonKey: { type: String, required: true, default: "default" },
    legalName: { type: String, default: "" },
    logoPath: { type: String, default: "" },
    registeredAddress: { type: String, default: "" },
    companyRegistrationNumber: { type: String, default: "" },
    vatNumber: { type: String, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    invoiceImportTemplates: { type: [invoiceImportTemplateSchema], default: [] },
  },
  { timestamps: true }
);

companySettingsSchema.index({ workspaceId: 1, singletonKey: 1 }, { unique: true });

export type CompanySettingsDoc = InferSchemaType<typeof companySettingsSchema> & {
  _id: mongoose.Types.ObjectId;
};

if (process.env.NODE_ENV !== "production") {
  delete (mongoose.models as Record<string, unknown>).CompanySettings;
}

export const CompanySettings =
  mongoose.models.CompanySettings ||
  mongoose.model("CompanySettings", companySettingsSchema);
