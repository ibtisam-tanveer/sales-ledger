import { Schema } from "mongoose";

export const invoiceLineSchema = new Schema(
  {
    shiftDate: { type: String, default: "" },
    description: { type: String, default: "" },
    unitPrice: { type: Number, required: true },
    totalHours: { type: Number, required: true },
  },
  { _id: true }
);
