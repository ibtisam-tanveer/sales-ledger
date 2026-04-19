import { formatPounds } from "@/lib/format/money";

const TOLERANCE = 0.05;

export type MathCheck = {
  linesMatchNet: boolean;
  netVatMatchGross: boolean;
  lineSum: number;
  messages: string[];
};

export function validateInvoiceMath(
  lines: { unitPrice: number; totalHours: number }[],
  amountNet: number,
  amountVat: number,
  amountGross: number
): MathCheck {
  const lineSum = lines.reduce((s, l) => s + l.unitPrice * l.totalHours, 0);
  const linesMatchNet = Math.abs(lineSum - amountNet) <= TOLERANCE;
  const netVatMatchGross =
    Math.abs(amountNet + amountVat - amountGross) <= TOLERANCE;

  const messages: string[] = [];
  if (!linesMatchNet) {
    messages.push(
      `Line total (${formatPounds(lineSum)}) does not match net (${formatPounds(amountNet)}).`
    );
  }
  if (!netVatMatchGross) {
    messages.push(
      `Net + VAT (${formatPounds(amountNet + amountVat)}) does not match gross (${formatPounds(amountGross)}).`
    );
  }

  return { linesMatchNet, netVatMatchGross, lineSum, messages };
}
