/**
 * docs/generate-spec.cjs
 *
 * Generates:
 *   docs/opportunity-os-spec.docx  — Word document
 *   docs/opportunity-os-spec.pdf   — PDF document
 *
 * from docs/opportunity-os-spec.md
 *
 * Dependencies (declared in root package.json):
 *   docx ^9.x   — programmatic DOCX generation
 *   pdfkit ^0.15 — programmatic PDF generation
 *
 * Usage:
 *   node docs/generate-spec.cjs
 */

"use strict";

const path = require("path");
const fs   = require("fs");

// Resolve from project root so this works in any environment after `pnpm install`
const ROOT = path.resolve(__dirname, "..");

const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, AlignmentType, PageBreak,
} = require(path.join(ROOT, "node_modules", "docx"));

const PDFDocument = require(path.join(ROOT, "node_modules", "pdfkit"));

const MD_FILE   = path.join(__dirname, "opportunity-os-spec.md");
const DOCX_FILE = path.join(__dirname, "opportunity-os-spec.docx");
const PDF_FILE  = path.join(__dirname, "opportunity-os-spec.pdf");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mdContent = fs.readFileSync(MD_FILE, "utf8");
const lines     = mdContent.split("\n");

function stripMarkdownInline(text) {
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
  return line
    .split("|")
    .map(c => c.trim())
    .filter((_, i, arr) => i > 0 && i < arr.length - 1);
}

// ─── DOCX ─────────────────────────────────────────────────────────────────────

function buildDocxElements(inputLines) {
  const elements = [];
  let i = 0;

  while (i < inputLines.length) {
    const line = inputLines[i].trimEnd();

    // Headings
    const h1 = line.match(/^# (.+)$/);
    const h2 = line.match(/^## (.+)$/);
    const h3 = line.match(/^### (.+)$/);
    const h4 = line.match(/^#### (.+)$/);

    if (h1) {
      elements.push(new Paragraph({ text: stripMarkdownInline(h1[1]), heading: HeadingLevel.HEADING_1, spacing: { before: 480, after: 240 } }));
      i++; continue;
    }
    if (h2) {
      elements.push(new Paragraph({ text: stripMarkdownInline(h2[1]), heading: HeadingLevel.HEADING_2, spacing: { before: 320, after: 160 } }));
      i++; continue;
    }
    if (h3) {
      elements.push(new Paragraph({ text: stripMarkdownInline(h3[1]), heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } }));
      i++; continue;
    }
    if (h4) {
      elements.push(new Paragraph({ text: stripMarkdownInline(h4[1]), heading: HeadingLevel.HEADING_4, spacing: { before: 140, after: 80 } }));
      i++; continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      elements.push(new Paragraph({ text: "", spacing: { before: 160, after: 160 } }));
      i++; continue;
    }

    // Table block
    if (line.trimStart().startsWith("|")) {
      const tableLines = [];
      while (i < inputLines.length && inputLines[i].trimEnd().trimStart().startsWith("|")) {
        tableLines.push(inputLines[i].trimEnd());
        i++;
      }
      const dataRows = tableLines.filter(l => !isSeparatorRow(l));
      if (dataRows.length === 0) continue;

      const headerCells = parseTableRow(dataRows[0]);
      const bodyRows    = dataRows.slice(1);

      const docxRows = [
        new TableRow({
          tableHeader: true,
          children: headerCells.map(cell =>
            new TableCell({
              shading: { fill: "2B4B6F" },
              children: [new Paragraph({
                children: [new TextRun({ text: stripMarkdownInline(cell), bold: true, size: 17, color: "FFFFFF" })],
              })],
            })
          ),
        }),
        ...bodyRows.map((rowLine, ri) => {
          const cells = parseTableRow(rowLine);
          while (cells.length < headerCells.length) cells.push("");
          return new TableRow({
            children: cells.map(cell =>
              new TableCell({
                shading: ri % 2 === 1 ? { fill: "EEF4FB" } : undefined,
                children: [new Paragraph({
                  children: [new TextRun({ text: stripMarkdownInline(cell), size: 16 })],
                })],
              })
            ),
          });
        }),
      ];

      elements.push(new Table({ rows: docxRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
      elements.push(new Paragraph({ text: "", spacing: { after: 120 } }));
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^(\d+)\. (.+)$/);
    if (olMatch) {
      elements.push(new Paragraph({
        children: [new TextRun({ text: olMatch[1] + ". " + stripMarkdownInline(olMatch[2]), size: 20 })],
        indent: { left: 720 },
        spacing: { after: 60 },
      }));
      i++; continue;
    }

    // Unordered list
    const ulMatch = line.match(/^[-*] (.+)$/);
    if (ulMatch) {
      elements.push(new Paragraph({
        children: [new TextRun({ text: "• " + stripMarkdownInline(ulMatch[1]), size: 20 })],
        indent: { left: 720 },
        spacing: { after: 60 },
      }));
      i++; continue;
    }

    // Code block
    if (line.startsWith("```")) {
      i++;
      while (i < inputLines.length && !inputLines[i].startsWith("```")) {
        const cl = inputLines[i];
        elements.push(new Paragraph({
          children: [new TextRun({ text: cl || " ", font: "Courier New", size: 16, color: "333333" })],
          indent: { left: 720 },
          spacing: { after: 40 },
        }));
        i++;
      }
      i++; // skip closing ```
      continue;
    }

    // Blockquote
    const bqMatch = line.match(/^> (.+)$/);
    if (bqMatch) {
      elements.push(new Paragraph({
        children: [new TextRun({ text: stripMarkdownInline(bqMatch[1]), italics: true, color: "555555", size: 19 })],
        indent: { left: 720 },
        spacing: { after: 80 },
      }));
      i++; continue;
    }

    // Empty line
    if (line.trim() === "") {
      elements.push(new Paragraph({ text: "", spacing: { after: 80 } }));
      i++; continue;
    }

    // Regular paragraph
    const plain = stripMarkdownInline(line);
    if (plain) {
      elements.push(new Paragraph({
        children: [new TextRun({ text: plain, size: 20 })],
        spacing: { after: 80 },
      }));
    }
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
        // Cover
        new Paragraph({ children: [new TextRun({ text: "Opportunity OS", bold: true, size: 72, color: "0B1220" })], alignment: AlignmentType.CENTER, spacing: { before: 2880, after: 400 } }),
        new Paragraph({ children: [new TextRun({ text: "Full Schema · Logic · Workflow · Feature Specification", size: 38, color: "10B981" })], alignment: AlignmentType.CENTER, spacing: { after: 400 } }),
        new Paragraph({ children: [new TextRun({ text: "Version 1.0 — April 2026", size: 28, color: "555555" })], alignment: AlignmentType.CENTER, spacing: { after: 240 } }),
        new Paragraph({ children: [new TextRun({ text: "Confidential — Internal Use Only", size: 22, italics: true, color: "888888" })], alignment: AlignmentType.CENTER, spacing: { after: 3600 } }),
        new Paragraph({ children: [new PageBreak()] }),
        // Body
        ...buildDocxElements(lines),
      ],
    }],
  });

  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(DOCX_FILE, buf);
  console.log(`DOCX: ${DOCX_FILE} (${Math.round(buf.length / 1024)} KB)`);
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

function generatePdf() {
  console.log("Generating PDF…");

  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 72, bottom: 72, left: 72, right: 72 },
    info: {
      Title:   "Opportunity OS — Full Specification",
      Author:  "Opportunity OS Platform",
      Subject: "Technical Specification",
    },
  });

  const stream = fs.createWriteStream(PDF_FILE);
  doc.pipe(stream);

  const C = {
    navy:     "#0B1220",
    emerald:  "#10B981",
    gray:     "#555555",
    lgray:    "#888888",
    white:    "#FFFFFF",
    thead:    "#2B4B6F",
    talt:     "#EEF4FB",
    codebg:   "#F5F5F5",
  };

  const PAGE_W = doc.page.width;
  const MARGIN  = 72;
  const CONTENT = PAGE_W - MARGIN * 2;

  // ── Cover ──
  doc.rect(0, 0, PAGE_W, doc.page.height).fill(C.navy);
  doc.fill(C.emerald).fontSize(38).font("Helvetica-Bold")
     .text("Opportunity OS", MARGIN, 180, { align: "center", width: CONTENT });
  doc.fill(C.white).fontSize(16).font("Helvetica")
     .text("Full Schema · Logic · Workflow · Feature Specification", MARGIN, 240, { align: "center", width: CONTENT });
  doc.fill(C.lgray).fontSize(13)
     .text("Version 1.0 — April 2026", MARGIN, 290, { align: "center", width: CONTENT });
  doc.fill(C.lgray).fontSize(11).font("Helvetica-Oblique")
     .text("Confidential — For Internal Use Only", MARGIN, 320, { align: "center", width: CONTENT });
  doc.addPage();

  // ── Page header helper ──
  let pageNum = 1;
  function addHeader() {
    doc.save();
    doc.rect(0, 0, PAGE_W, 38).fill("#F2F4F7");
    doc.fill(C.navy).fontSize(7.5).font("Helvetica-Bold")
       .text("OPPORTUNITY OS — FULL SPECIFICATION", MARGIN, 13, { align: "left" });
    doc.fill(C.lgray).fontSize(7.5).font("Helvetica")
       .text(`Page ${pageNum}`, MARGIN, 13, { align: "right", width: CONTENT });
    doc.restore();
    pageNum++;
    doc.y = 50;
  }

  function checkPage(needed) {
    if (doc.y + needed > doc.page.height - MARGIN) {
      doc.addPage();
      addHeader();
    }
  }

  function renderTable(tableLines) {
    const dataRows = tableLines.filter(l => !isSeparatorRow(l));
    if (dataRows.length === 0) return;

    const headers  = parseTableRow(dataRows[0]);
    const body     = dataRows.slice(1);
    const colCount = Math.max(1, headers.length);
    const colW     = CONTENT / colCount;
    const headH    = 22;
    const rowH     = 18;

    checkPage(headH + Math.min(body.length, 5) * rowH + 10);

    const startX = MARGIN;
    // Header row
    const hy = doc.y;
    doc.rect(startX, hy, CONTENT, headH).fill(C.thead);
    headers.forEach((h, ci) => {
      doc.fill(C.white).fontSize(7.5).font("Helvetica-Bold")
         .text(stripMarkdownInline(h), startX + ci * colW + 3, hy + 6, { width: colW - 6, lineBreak: false, ellipsis: true });
    });
    doc.y = hy + headH;

    body.forEach((rowLine, ri) => {
      checkPage(rowH + 4);
      const cells = parseTableRow(rowLine);
      while (cells.length < colCount) cells.push("");
      const ry = doc.y;
      if (ri % 2 === 1) doc.rect(startX, ry, CONTENT, rowH).fill(C.talt);
      cells.forEach((cell, ci) => {
        doc.fill(C.navy).fontSize(7).font("Helvetica")
           .text(stripMarkdownInline(cell), startX + ci * colW + 3, ry + 5, { width: colW - 6, lineBreak: false, ellipsis: true });
      });
      doc.rect(startX, ry, CONTENT, rowH).stroke("#DDDDDD");
      doc.y = ry + rowH;
    });
    doc.y += 10;
  }

  addHeader();

  let inCode   = false;
  let codeLines = [];
  let tableLines = [];

  function flushCode() {
    if (codeLines.length === 0) return;
    const bh = codeLines.length * 11 + 14;
    checkPage(bh);
    doc.rect(MARGIN, doc.y, CONTENT, bh).fill(C.codebg);
    doc.y += 7;
    codeLines.forEach(cl => {
      doc.fill("#333333").fontSize(7.5).font("Courier")
         .text(cl || " ", MARGIN + 8, doc.y, { width: CONTENT - 16, lineBreak: false });
      doc.y += 11;
    });
    doc.y += 7;
    codeLines = [];
  }

  function flushTable() {
    if (tableLines.length > 0) {
      renderTable(tableLines);
      tableLines = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line    = rawLine.trimEnd();

    // Code fence
    if (line.startsWith("```")) {
      if (!inCode) { inCode = true; continue; }
      else { inCode = false; flushCode(); continue; }
    }
    if (inCode) { codeLines.push(line); continue; }

    // Table
    if (line.trimStart().startsWith("|")) {
      tableLines.push(line);
      continue;
    } else if (tableLines.length > 0) {
      flushTable();
    }

    checkPage(20);

    const h1 = line.match(/^# (.+)$/);
    const h2 = line.match(/^## (.+)$/);
    const h3 = line.match(/^### (.+)$/);
    const h4 = line.match(/^#### (.+)$/);

    if (h1) {
      if (doc.y > 100) { doc.addPage(); addHeader(); }
      doc.rect(MARGIN, doc.y, CONTENT, 32).fill(C.navy);
      doc.fill(C.white).fontSize(17).font("Helvetica-Bold")
         .text(stripMarkdownInline(h1[1]), MARGIN + 8, doc.y - 24, { width: CONTENT - 16 });
      doc.y += 8;
      continue;
    }
    if (h2) {
      doc.y += 6;
      doc.fill(C.emerald).fontSize(13).font("Helvetica-Bold")
         .text(stripMarkdownInline(h2[1]), MARGIN, doc.y);
      doc.rect(MARGIN, doc.y + 16, CONTENT, 1.5).fill(C.emerald);
      doc.y += 22;
      continue;
    }
    if (h3) {
      doc.y += 4;
      doc.fill(C.navy).fontSize(11).font("Helvetica-Bold")
         .text(stripMarkdownInline(h3[1]), MARGIN, doc.y);
      doc.y += 2;
      continue;
    }
    if (h4) {
      doc.y += 3;
      doc.fill(C.navy).fontSize(10).font("Helvetica-Bold")
         .text(stripMarkdownInline(h4[1]), MARGIN, doc.y);
      doc.y += 2;
      continue;
    }

    // HR
    if (/^---+$/.test(line.trim())) {
      doc.rect(MARGIN, doc.y + 5, CONTENT, 0.8).fill("#CCCCCC");
      doc.y += 14;
      continue;
    }

    // Ordered list
    const ol = line.match(/^(\d+)\. (.+)$/);
    if (ol) {
      doc.fill(C.navy).fontSize(9).font("Helvetica")
         .text(ol[1] + ". " + stripMarkdownInline(ol[2]), MARGIN + 12, doc.y, { width: CONTENT - 12 });
      doc.y += 3;
      continue;
    }

    // Unordered list
    const ul = line.match(/^[-*] (.+)$/);
    if (ul) {
      doc.fill(C.navy).fontSize(9).font("Helvetica")
         .text("• " + stripMarkdownInline(ul[1]), MARGIN + 12, doc.y, { width: CONTENT - 12 });
      doc.y += 3;
      continue;
    }

    // Blockquote
    const bq = line.match(/^> (.+)$/);
    if (bq) {
      doc.rect(MARGIN, doc.y, 3, 13).fill(C.emerald);
      doc.fill(C.gray).fontSize(9).font("Helvetica-Oblique")
         .text(stripMarkdownInline(bq[1]), MARGIN + 8, doc.y, { width: CONTENT - 8 });
      doc.y += 5;
      continue;
    }

    // Empty
    if (line.trim() === "") { doc.y += 5; continue; }

    // Paragraph
    const plain = stripMarkdownInline(line);
    if (plain) {
      doc.fill(C.navy).fontSize(9).font("Helvetica")
         .text(plain, MARGIN, doc.y, { width: CONTENT });
      doc.y += 3;
    }
  }

  flushTable();
  flushCode();

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on("finish", () => {
      const size = fs.statSync(PDF_FILE).size;
      console.log(`PDF:  ${PDF_FILE} (${Math.round(size / 1024)} KB)`);
      resolve();
    });
    stream.on("error", reject);
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  try {
    await generateDocx();
    await generatePdf();
    console.log("\nDone. Files:");
    console.log("  docs/opportunity-os-spec.md");
    console.log("  docs/opportunity-os-spec.docx");
    console.log("  docs/opportunity-os-spec.pdf");
  } catch (err) {
    console.error("Error:", err.message || err);
    process.exit(1);
  }
})();
