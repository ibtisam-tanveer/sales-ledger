import { PDFParse } from "pdf-parse";

const LOW_TEXT_THRESHOLD = 80;

export type ExtractOutcome =
  | { ok: true; text: string; usedOpenAiFallback: boolean }
  | { ok: false; error: string };

export async function extractPdfText(buffer: Buffer): Promise<{
  text: string;
  isLowText: boolean;
}> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const text = result.text?.trim() ?? "";
    return {
      text,
      isLowText: text.length < LOW_TEXT_THRESHOLD,
    };
  } finally {
    await parser.destroy();
  }
}
