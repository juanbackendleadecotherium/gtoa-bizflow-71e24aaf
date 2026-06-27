/**
 * Server-side generator for the "Términos y Condiciones de Venta" PDF
 * attached to invoice emails. Uses pdf-lib (pure JS, Worker-compatible).
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type TermsPdfInput = {
  title: string;
  content: string; // plain text (paragraphs separated by blank lines)
  version: number;
  brand_name: string;
  brand_color?: string | null;
};

function hexToRgb(hex?: string | null): { r: number; g: number; b: number } {
  if (!hex) return { r: 0.06, g: 0.09, b: 0.16 };
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(v, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

function wrapText(text: string, maxWidth: number, font: any, size: number): string[] {
  const out: string[] = [];
  for (const rawLine of text.split("\n")) {
    if (!rawLine.trim()) { out.push(""); continue; }
    const words = rawLine.split(/\s+/);
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > maxWidth) {
        if (line) out.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

// Strip basic HTML tags + decode common entities so old terms saved as HTML render cleanly.
function htmlToPlain(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])\s*>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Normalize text so pdf-lib's WinAnsi encoder doesn't choke on smart quotes / em-dashes.
function sanitize(text: string): string {
  return text
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2022/g, "•")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ");
}

export async function buildTermsPdf(input: TermsPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const accent = hexToRgb(input.brand_color);
  const fg = rgb(0.06, 0.09, 0.16);
  const muted = rgb(0.4, 0.45, 0.55);

  const PAGE_W = 595.28, PAGE_H = 841.89; // A4
  const MARGIN_X = 56, MARGIN_TOP = 56, MARGIN_BOTTOM = 56;
  const BODY_W = PAGE_W - MARGIN_X * 2;
  const BODY_SIZE = 10.5;
  const LINE = 14;

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN_TOP;

  const drawHeader = () => {
    page.drawRectangle({
      x: 0, y: PAGE_H - 6, width: PAGE_W, height: 6,
      color: rgb(accent.r, accent.g, accent.b),
    });
    page.drawText(input.brand_name, {
      x: MARGIN_X, y: PAGE_H - 30, size: 11, font: fontBold, color: fg,
    });
    page.drawText(`v${input.version}`, {
      x: PAGE_W - MARGIN_X - fontBold.widthOfTextAtSize(`v${input.version}`, 10),
      y: PAGE_H - 30, size: 10, font: fontBold, color: muted,
    });
  };

  const drawFooter = (n: number) => {
    const txt = `${input.brand_name} · info@grupogetova.com · Página ${n}`;
    const w = font.widthOfTextAtSize(txt, 8);
    page.drawText(txt, {
      x: (PAGE_W - w) / 2, y: 28, size: 8, font, color: muted,
    });
  };

  let pageNum = 1;
  drawHeader();

  // Title
  const title = sanitize(input.title || "Términos y Condiciones de Venta");
  y -= 24;
  page.drawText(title, { x: MARGIN_X, y, size: 18, font: fontBold, color: fg });
  y -= 22;

  const plain = sanitize(htmlToPlain(input.content));
  const lines = wrapText(plain, BODY_W, font, BODY_SIZE);

  for (const line of lines) {
    if (y < MARGIN_BOTTOM + 24) {
      drawFooter(pageNum);
      page = doc.addPage([PAGE_W, PAGE_H]);
      pageNum += 1;
      drawHeader();
      y = PAGE_H - MARGIN_TOP - 10;
    }
    if (line === "") {
      y -= LINE * 0.6;
      continue;
    }
    page.drawText(line, { x: MARGIN_X, y, size: BODY_SIZE, font, color: fg });
    y -= LINE;
  }
  drawFooter(pageNum);

  return await doc.save();
}
