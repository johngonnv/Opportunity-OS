/**
 * docs/generate-spec.cjs
 *
 * Generates the Opportunity OS technical specification in two formats:
 *   docs/opportunity-os-spec.docx  — formatted Word document
 *   docs/opportunity-os-spec.pdf   — print-quality PDF via Puppeteer/Chromium
 *
 * Source:
 *   docs/opportunity-os-spec.md
 *
 * Dependencies (declared in root package.json; install with `pnpm install`):
 *   docx      ^9.x   — programmatic DOCX generation
 *   md-to-pdf ^5.x   — Markdown → PDF via headless Chromium (Puppeteer)
 *
 * Usage:
 *   node docs/generate-spec.cjs
 *
 * Environment:
 *   PUPPETEER_EXECUTABLE_PATH — optional; override Chromium binary path.
 *   In Replit, set automatically via REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE.
 */

"use strict";

const path = require("path");
const fs   = require("fs");

// Standard module resolution — works after `pnpm install`
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, AlignmentType, PageBreak,
} = require("docx");

const { mdToPdf } = require("md-to-pdf");

const MD_FILE   = path.join(__dirname, "opportunity-os-spec.md");
const DOCX_FILE = path.join(__dirname, "opportunity-os-spec.docx");
const PDF_FILE  = path.join(__dirname, "opportunity-os-spec.pdf");

const mdContent = fs.readFileSync(MD_FILE, "utf8");
const lines     = mdContent.split("\n");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripInline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g,     "$1")
    .replace(/`(.+?)`/g,       "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .trim();
}

function isSeparatorRow(line) {
  return /^\|[\s\-|:]+\|$/.test(line.trim());
}

function parseTableRow(line) {
  return line.split("|")
    .map(c => c.trim())
    .filter((_, i, arr) => i > 0 && i < arr.length - 1);
}

// ─── DOCX Generation ─────────────────────────────────────────────────────────

function buildDocxChildren(inputLines) {
  const elements = [];
  let i = 0;

  while (i < inputLines.length) {
    const line = inputLines[i].trimEnd();

    // Headings
    const h1 = line.match(/^# (.+)$/);
    const h2 = line.match(/^## (.+)$/);
    const h3 = line.match(/^### (.+)$/);
    const h4 = line.match(/^#### (.+)$/);

    if (h1) { elements.push(new Paragraph({ text: stripInline(h1[1]), heading: HeadingLevel.HEADING_1, spacing: { before: 480, after: 200 } })); i++; continue; }
    if (h2) { elements.push(new Paragraph({ text: stripInline(h2[1]), heading: HeadingLevel.HEADING_2, spacing: { before: 320, after: 120 } })); i++; continue; }
    if (h3) { elements.push(new Paragraph({ text: stripInline(h3[1]), heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 80 }  })); i++; continue; }
    if (h4) { elements.push(new Paragraph({ text: stripInline(h4[1]), heading: HeadingLevel.HEADING_4, spacing: { before: 140, after: 60 }  })); i++; continue; }

    // HR
    if (/^---+$/.test(line.trim())) { elements.push(new Paragraph({ text: "", spacing: { before: 120, after: 120 } })); i++; continue; }

    // Table block
    if (line.trimStart().startsWith("|")) {
      const tLines = [];
      while (i < inputLines.length && inputLines[i].trimEnd().trimStart().startsWith("|")) {
        tLines.push(inputLines[i].trimEnd());
        i++;
      }
      const dataRows = tLines.filter(l => !isSeparatorRow(l));
      if (!dataRows.length) continue;
      const headers  = parseTableRow(dataRows[0]);
      const bodyRows = dataRows.slice(1);
      elements.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            children: headers.map(h =>
              new TableCell({
                shading: { fill: "2B4B6F" },
                children: [new Paragraph({ children: [new TextRun({ text: stripInline(h), bold: true, size: 16, color: "FFFFFF" })] })],
              })
            ),
          }),
          ...bodyRows.map((rowLine, ri) => {
            const cells = parseTableRow(rowLine);
            while (cells.length < headers.length) cells.push("");
            return new TableRow({
              children: cells.map(cell =>
                new TableCell({
                  shading: ri % 2 === 1 ? { fill: "EEF4FB" } : undefined,
                  children: [new Paragraph({ children: [new TextRun({ text: stripInline(cell), size: 15 })] })],
                })
              ),
            });
          }),
        ],
      }));
      elements.push(new Paragraph({ text: "", spacing: { after: 100 } }));
      continue;
    }

    // Ordered list
    const ol = line.match(/^(\d+)\. (.+)$/);
    if (ol) { elements.push(new Paragraph({ children: [new TextRun({ text: ol[1] + ". " + stripInline(ol[2]), size: 20 })], indent: { left: 720 }, spacing: { after: 60 } })); i++; continue; }

    // Unordered list
    const ul = line.match(/^[-*] (.+)$/);
    if (ul) { elements.push(new Paragraph({ children: [new TextRun({ text: "• " + stripInline(ul[1]), size: 20 })], indent: { left: 720 }, spacing: { after: 60 } })); i++; continue; }

    // Code block
    if (line.startsWith("```")) {
      i++;
      while (i < inputLines.length && !inputLines[i].startsWith("```")) {
        elements.push(new Paragraph({ children: [new TextRun({ text: inputLines[i] || " ", font: "Courier New", size: 15, color: "333333" })], indent: { left: 720 }, spacing: { after: 36 } }));
        i++;
      }
      i++;
      continue;
    }

    // Blockquote
    const bq = line.match(/^> (.+)$/);
    if (bq) { elements.push(new Paragraph({ children: [new TextRun({ text: stripInline(bq[1]), italics: true, color: "555555", size: 18 })], indent: { left: 720 }, spacing: { after: 80 } })); i++; continue; }

    // Empty
    if (line.trim() === "") { elements.push(new Paragraph({ text: "", spacing: { after: 80 } })); i++; continue; }

    // Paragraph
    const plain = stripInline(line);
    if (plain) elements.push(new Paragraph({ children: [new TextRun({ text: plain, size: 20 })], spacing: { after: 80 } }));
    i++;
  }

  return elements;
}

async function generateDocx() {
  console.log("Generating DOCX…");

  const doc = new Document({
    creator: "Opportunity OS Platform",
    title:   "Opportunity OS — Full Schema, Logic, Workflow, and Feature Specification",
    styles: {
      default: { document: { run: { font: "Calibri", size: 22 } } },
    },
    sections: [{
      properties: { page: { margin: { top: 1440, right: 1080, bottom: 1440, left: 1080 } } },
      children: [
        new Paragraph({ children: [new TextRun({ text: "Opportunity OS", bold: true, size: 72, color: "0B1220" })], alignment: AlignmentType.CENTER, spacing: { before: 2880, after: 400 } }),
        new Paragraph({ children: [new TextRun({ text: "Full Schema · Logic · Workflow · Feature Specification", size: 36, color: "10B981" })], alignment: AlignmentType.CENTER, spacing: { after: 360 } }),
        new Paragraph({ children: [new TextRun({ text: "Version 1.0 — April 2026", size: 26, color: "555555" })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: "Confidential — For Internal Use Only", size: 22, italics: true, color: "888888" })], alignment: AlignmentType.CENTER, spacing: { after: 3600 } }),
        new Paragraph({ children: [new PageBreak()] }),
        ...buildDocxChildren(lines),
      ],
    }],
  });

  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(DOCX_FILE, buf);
  console.log(`  DOCX: ${DOCX_FILE} (${Math.round(buf.length / 1024)} KB)`);
}

// ─── PDF Generation (md-to-pdf + Puppeteer/Chromium) ─────────────────────────

async function generatePdf() {
  console.log("Generating PDF (md-to-pdf)…");

  // Chromium binary: prefer explicit env var, then fall back to Replit's Playwright binary
  const chromiumPath =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
    undefined;

  const css = `
    body { font-family: "Helvetica Neue", Arial, sans-serif; font-size: 10pt; color: #0B1220; line-height: 1.5; }
    h1   { font-size: 20pt; color: #0B1220; background: #0B1220; color: white; padding: 8px 12px; margin-top: 32px; }
    h2   { font-size: 14pt; color: #10B981; border-bottom: 2px solid #10B981; padding-bottom: 4px; margin-top: 24px; }
    h3   { font-size: 11pt; color: #0B1220; margin-top: 18px; }
    h4   { font-size: 10pt; color: #0B1220; font-style: italic; margin-top: 12px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 8.5pt; }
    th    { background: #2B4B6F; color: white; padding: 5px 7px; text-align: left; }
    td    { padding: 4px 7px; border-bottom: 1px solid #DDD; }
    tr:nth-child(even) td { background: #EEF4FB; }
    pre, code { background: #F5F5F5; font-family: "Courier New", monospace; font-size: 8pt; padding: 2px 4px; border-radius: 2px; }
    pre   { padding: 10px 14px; margin: 8px 0; overflow: auto; }
    blockquote { border-left: 3px solid #10B981; margin: 8px 0 8px 8px; padding: 2px 12px; color: #555; font-style: italic; }
    hr    { border: none; border-top: 1px solid #CCC; margin: 20px 0; }
  `;

  const launchOptions = {
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  };
  if (chromiumPath) launchOptions.executablePath = chromiumPath;

  const pdf = await mdToPdf(
    { path: MD_FILE },
    {
      launch_options: launchOptions,
      css,
      pdf_options: {
        format: "Letter",
        margin: { top: "0.9in", right: "0.75in", bottom: "0.9in", left: "0.75in" },
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: `<div style="font-size:7pt;font-family:Arial,sans-serif;color:#888;width:100%;padding:0 0.75in;box-sizing:border-box;"><span style="float:left">Opportunity OS — Full Specification</span><span style="float:right">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
        footerTemplate: `<div style="font-size:6pt;font-family:Arial,sans-serif;color:#aaa;width:100%;padding:0 0.75in;text-align:center;box-sizing:border-box;">Confidential — Opportunity OS Platform — April 2026</div>`,
      },
    }
  );

  if (!pdf || !pdf.content) throw new Error("md-to-pdf returned empty content");

  fs.writeFileSync(PDF_FILE, pdf.content);
  console.log(`  PDF:  ${PDF_FILE} (${Math.round(pdf.content.length / 1024)} KB)`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  try {
    await generateDocx();
    await generatePdf();
    console.log("\nAll files generated:");
    console.log("  docs/opportunity-os-spec.md   (source)");
    console.log("  docs/opportunity-os-spec.docx (Word)");
    console.log("  docs/opportunity-os-spec.pdf  (PDF via Puppeteer/Chromium)");
  } catch (err) {
    console.error("Generation failed:", err.message || err);
    process.exit(1);
  }
})();
