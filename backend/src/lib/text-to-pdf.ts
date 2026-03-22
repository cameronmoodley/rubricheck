/**
 * Generate a PDF from plain text (e.g. template description for question paper).
 * pdf-lib StandardFonts (Helvetica) only support WinAnsi encoding - we must
 * replace Unicode chars (bullets, em dash, smart quotes) with ASCII equivalents.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function sanitizeForWinAnsi(text: string): string {
  return text
    .replace(/\u2022/g, "-")        // bullet •
    .replace(/\u25CF/g, "-")        // black circle ●
    .replace(/\u2013/g, "-")        // en dash –
    .replace(/\u2014/g, "-")       // em dash —
    .replace(/\u2018/g, "'")       // left single quote ‘
    .replace(/\u2019/g, "'")       // right single quote ’
    .replace(/\u201C/g, '"')       // left double quote “
    .replace(/\u201D/g, '"')       // right double quote "
    .replace(/\u00A0/g, " ")       // non-breaking space
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")  // control chars
    .replace(/[^\x00-\xFF]/g, "-"); // any other non-WinAnsi -> hyphen
}

const MARGIN = 50;
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LINE_HEIGHT = 14;
const FONT_SIZE = 12;
const CHARS_PER_LINE = Math.floor((PAGE_WIDTH - 2 * MARGIN) / 7.2); // Approx chars per line for Helvetica 12pt

function wrapText(text: string): string[] {
  const lines: string[] = [];
  const paragraphs = text.split(/\n+/);
  for (const para of paragraphs) {
    let remaining = sanitizeForWinAnsi(para.trim());
    while (remaining.length > 0) {
      if (remaining.length <= CHARS_PER_LINE) {
        lines.push(remaining);
        break;
      }
      let breakAt = remaining.lastIndexOf(" ", CHARS_PER_LINE);
      if (breakAt <= 0) breakAt = CHARS_PER_LINE;
      lines.push(remaining.slice(0, breakAt).trim());
      remaining = remaining.slice(breakAt).trim();
    }
  }
  return lines;
}

export async function textToPdfBuffer(
  text: string | null | undefined,
  title?: string
): Promise<Buffer> {
  const safeText = sanitizeForWinAnsi(text?.trim() || "(No content)");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const titleLines = title ? wrapText(sanitizeForWinAnsi(title)) : [];
  const contentLines = wrapText(safeText);

  for (const line of [...titleLines, "", ...contentLines]) {
    if (y < MARGIN) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    const isTitleLine = titleLines.length > 0 && titleLines.includes(line);
    page.drawText(line || " ", {
      x: MARGIN,
      y,
      size: FONT_SIZE,
      font: isTitleLine ? boldFont : font,
      color: rgb(0, 0, 0),
    });
    y -= LINE_HEIGHT;
  }

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}
