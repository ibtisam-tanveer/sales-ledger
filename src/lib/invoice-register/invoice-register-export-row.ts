export type InvoiceRegisterExportRow = {
  _id: string;
  invoiceNumber: string;
  issueDate: string;
  postedAt: string | null;
  customerName: string;
  siteAddress: string;
  status: string;
  amountNet: number;
  amountVat: number;
  amountGross: number;
  hasPdf: boolean;
};
