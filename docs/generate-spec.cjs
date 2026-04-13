/**
 * generate-spec.cjs
 * Generates docs/opportunity-os-spec.docx and docs/opportunity-os-spec.pdf
 * from docs/opportunity-os-spec.md
 *
 * Run: node docs/generate-spec.cjs
 */

const path = require("path");
const fs = require("fs");

const NODE_PATH = "/tmp/node_modules";

const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, PageBreak, Spacing
} = require(path.join(NODE_PATH, "docx"));

const PDFDocument = require(path.join(NODE_PATH, "pdfkit"));

const MD_FILE = path.join(__dirname, "opportunity-os-spec.md");
const DOCX_FILE = path.join(__dirname, "opportunity-os-spec.docx");
const PDF_FILE = path.join(__dirname, "opportunity-os-spec.pdf");

// ─── Read source ──────────────────────────────────────────────────────────────
const mdContent = fs.readFileSync(MD_FILE, "utf8");
const lines = mdContent.split("\n");

// ─── DOCX Generation ─────────────────────────────────────────────────────────

function parseInlineText(line) {
  // Strip markdown inline formatting for plain text in DOCX
  return line
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .trim();
}

function isSeparatorRow(line) {
  return /^\|[\s\-|:]+\|$/.test(line.trim());
}

function parseTableRow(line) {
  return line.split("|").map(c => c.trim()).filter((c, i, arr) => i > 0 && i < arr.length - 1);
}

function buildDocxElements(lines) {
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // --- Headings ---
    const h1 = line.match(/^# (.+)$/);
    const h2 = line.match(/^## (.+)$/);
    const h3 = line.match(/^### (.+)$/);
    const h4 = line.match(/^#### (.+)$/);

    if (h1) {
      elements.push(
        new Paragraph({
          text: parseInlineText(h1[1]),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
        })
      );
      i++; continue;
    }

    if (h2) {
      elements.push(
        new Paragraph({
          text: parseInlineText(h2[1]),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 150 },
        })
      );
      i++; continue;
    }

    if (h3) {
      elements.push(
        new Paragraph({
          text: parseInlineText(h3[1]),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 },
        })
      );
      i++; continue;
    }

    if (h4) {
      elements.push(
        new Paragraph({
          text: parseInlineText(h4[1]),
          heading: HeadingLevel.HEADING_4,
          spacing: { before: 150, after: 80 },
        })
      );
      i++; continue;
    }

    // --- Horizontal rule ---
    if (/^---+$/.test(line.trim())) {
      elements.push(new Paragraph({ text: "", spacing: { before: 200, after: 200 } }));
      i++; continue;
    }

    // --- Table detection ---
    if (line.startsWith("|")) {
      const tableLines = [];
      while (i < lines.length && lines[i].trimEnd().startsWith("|")) {
        tableLines.push(lines[i].trimEnd());
        i++;
      }

      const dataRows = tableLines.filter(l => !isSeparatorRow(l));
      if (dataRows.length === 0) continue;

      const headerCells = parseTableRow(dataRows[0]);
      const bodyRows = dataRows.slice(1);

      const docxRows = [
        new TableRow({
          children: headerCells.map(cell =>
            new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ text: parseInlineText(cell), bold: true, size: 18 })],
              })],
              shading: { fill: "2B4B6F" },
            })
          ),
          tableHeader: true,
        }),
        ...bodyRows.map((rowLine, ri) => {
          const cells = parseTableRow(rowLine);
          while (cells.length < headerCells.length) cells.push("");
          return new TableRow({
            children: cells.map(cell =>
              new TableCell({
                children: [new Paragraph({
                  children: [new TextRun({ text: parseInlineText(cell), size: 16 })],
                })],
                shading: ri % 2 === 0 ? undefined : { fill: "F2F6FC" },
              })
            ),
          });
        }),
      ];

      elements.push(
        new Table({
          rows: docxRows,
          width: { size: 100, type: WidthType.PERCENTAGE },
        })
      );
      elements.push(new Paragraph({ text: "", spacing: { after: 150 } }));
      continue;
    }

    // --- List items ---
    const listItem = line.match(/^[-*] (.+)$/);
    const numberedItem = line.match(/^(\d+)\. (.+)$/);

    if (listItem) {
      elements.push(
        new Paragraph({
          children: [new TextRun({ text: "• " + parseInlineText(listItem[1]), size: 20 })],
          indent: { left: 720 },
          spacing: { after: 60 },
        })
      );
      i++; continue;
    }

    if (numberedItem) {
      elements.push(
        new Paragraph({
          children: [new TextRun({ text: numberedItem[1] + ". " + parseInlineText(numberedItem[2]), size: 20 })],
          indent: { left: 720 },
          spacing: { after: 60 },
        })
      );
      i++; continue;
    }

    // --- Code blocks ---
    if (line.startsWith("```")) {
      i++;
      const codeLines = [];
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      for (const cl of codeLines) {
        elements.push(
          new Paragraph({
            children: [new TextRun({ text: cl || " ", font: "Courier New", size: 16, color: "333333" })],
            indent: { left: 720 },
            spacing: { after: 40 },
          })
        );
      }
      continue;
    }

    // --- Blockquote ---
    const bq = line.match(/^> (.+)$/);
    if (bq) {
      elements.push(
        new Paragraph({
          children: [new TextRun({ text: parseInlineText(bq[1]), italics: true, color: "555555", size: 20 })],
          indent: { left: 720 },
          spacing: { after: 80 },
        })
      );
      i++; continue;
    }

    // --- Empty line ---
    if (line.trim() === "") {
      elements.push(new Paragraph({ text: "", spacing: { after: 80 } }));
      i++; continue;
    }

    // --- Bold/inline formatted paragraph ---
    const parts = [];
    let remaining = line.trim();
    const inlinePattern = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|(.+?)(?=\*\*|\*|`|$))/g;
    let match;
    let plainBuf = "";
    // Simple approach: strip all markup and emit as plain
    const plainText = parseInlineText(line);
    if (plainText) {
      elements.push(
        new Paragraph({
          children: [new TextRun({ text: plainText, size: 20 })],
          spacing: { after: 80 },
        })
      );
    }
    i++;
  }

  return elements;
}

async function generateDocx() {
  console.log("Generating DOCX...");
  const docElements = buildDocxElements(lines);

  const doc = new Document({
    creator: "Opportunity OS Platform",
    title: "Opportunity OS — Full Schema, Logic, Workflow, and Feature Specification",
    description: "Build-ready technical specification for Opportunity OS",
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1080, bottom: 1440, left: 1080 },
          },
        },
        children: [
          // Cover page
          new Paragraph({
            children: [
              new TextRun({
                text: "Opportunity OS",
                bold: true,
                size: 72,
                color: "0B1220",
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 2880, after: 400 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Full Schema, Logic, Workflow, and Feature Specification",
                size: 40,
                color: "10B981",
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Version 1.0 — April 2026",
                size: 28,
                color: "555555",
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Confidential — For Internal Use Only",
                size: 24,
                italics: true,
                color: "888888",
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 3600 },
          }),
          new Paragraph({
            children: [new PageBreak()],
          }),
          ...docElements,
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(DOCX_FILE, buffer);
  console.log(`DOCX written to: ${DOCX_FILE} (${Math.round(buffer.length / 1024)} KB)`);
}

// ─── PDF Generation ───────────────────────────────────────────────────────────

function generatePdf() {
  console.log("Generating PDF...");
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 72, bottom: 72, left: 72, right: 72 },
    info: {
      Title: "Opportunity OS — Full Specification",
      Author: "Opportunity OS Platform",
      Subject: "Technical Specification",
    },
  });

  const stream = fs.createWriteStream(PDF_FILE);
  doc.pipe(stream);

  // Color palette
  const C = {
    navy: "#0B1220",
    emerald: "#10B981",
    gray: "#555555",
    lightgray: "#888888",
    white: "#FFFFFF",
    tablehead: "#2B4B6F",
    tablealt: "#F2F6FC",
    code: "#F5F5F5",
  };

  // Cover page
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(C.navy);
  doc.fill(C.emerald).fontSize(42).font("Helvetica-Bold")
    .text("Opportunity OS", 72, 200, { align: "center", width: doc.page.width - 144 });
  doc.fill(C.white).fontSize(18).font("Helvetica")
    .text("Full Schema, Logic, Workflow, and Feature Specification", 72, 270, { align: "center", width: doc.page.width - 144 });
  doc.fill(C.lightgray).fontSize(14)
    .text("Version 1.0 — April 2026", 72, 320, { align: "center", width: doc.page.width - 144 });
  doc.fill(C.lightgray).fontSize(12).font("Helvetica-Oblique")
    .text("Confidential — For Internal Use Only", 72, 360, { align: "center", width: doc.page.width - 144 });

  doc.addPage();

  // Page header/footer helpers
  function addPageHeader() {
    doc.save();
    doc.rect(0, 0, doc.page.width, 40).fill("#F8F9FA");
    doc.fill(C.navy).fontSize(8).font("Helvetica-Bold")
      .text("OPPORTUNITY OS — FULL SPECIFICATION", 72, 14, { align: "left" });
    doc.fill(C.lightgray).fontSize(8).font("Helvetica")
      .text(`Page ${doc.bufferedPageRange().start + doc.bufferedPageRange().count}`, 72, 14, { align: "right", width: doc.page.width - 144 });
    doc.restore();
    doc.y = 55;
  }

  function parseInlineForPdf(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/`(.+?)`/g, "$1")
      .replace(/\[(.+?)\]\(.+?\)/g, "$1")
      .trim();
  }

  addPageHeader();

  let inTable = false;
  let tableRows = [];
  let inCode = false;
  let codeLines = [];

  function flushTable() {
    if (tableRows.length < 2) { tableRows = []; return; }

    const dataRows = tableRows.filter(r => !isSeparatorRow(r));
    if (dataRows.length === 0) { tableRows = []; return; }

    const headers = parseTableRow(dataRows[0]);
    const body = dataRows.slice(1);

    const colCount = headers.length;
    const pageWidth = doc.page.width - 144;
    const colWidth = pageWidth / colCount;
    const rowHeight = 20;
    const headerHeight = 24;

    // Check page space
    const neededHeight = headerHeight + body.length * rowHeight + 20;
    if (doc.y + neededHeight > doc.page.height - 72) {
      doc.addPage();
      addPageHeader();
    }

    // Header row
    const startX = 72;
    let cx = startX;
    doc.rect(startX, doc.y, pageWidth, headerHeight).fill(C.tablehead);
    headers.forEach((h, idx) => {
      doc.fill(C.white).fontSize(8).font("Helvetica-Bold")
        .text(parseInlineForPdf(h), cx + 3, doc.y - headerHeight + 6, { width: colWidth - 6, ellipsis: true, lineBreak: false });
      cx += colWidth;
    });
    doc.y += 4;

    // Body rows
    body.forEach((rowLine, ri) => {
      const cells = parseTableRow(rowLine);
      while (cells.length < colCount) cells.push("");

      if (doc.y + rowHeight > doc.page.height - 72) {
        doc.addPage();
        addPageHeader();
      }

      const rowY = doc.y;
      if (ri % 2 === 1) {
        doc.rect(startX, rowY, pageWidth, rowHeight).fill(C.tablealt);
      }
      cx = startX;
      cells.forEach((cell) => {
        doc.fill(C.navy).fontSize(7.5).font("Helvetica")
          .text(parseInlineForPdf(cell), cx + 3, rowY + 5, { width: colWidth - 6, ellipsis: true, lineBreak: false });
        cx += colWidth;
      });

      // Row border
      doc.rect(startX, rowY, pageWidth, rowHeight).stroke("#DDDDDD");
      doc.y = rowY + rowHeight;
    });

    // Table border
    doc.rect(startX, doc.y - (body.length * rowHeight + headerHeight), pageWidth, body.length * rowHeight + headerHeight).stroke(C.tablehead);

    doc.y += 12;
    tableRows = [];
  }

  function flushCode() {
    if (codeLines.length === 0) { codeLines = []; return; }
    const lineCount = codeLines.length;
    const blockHeight = lineCount * 12 + 16;
    if (doc.y + blockHeight > doc.page.height - 72) {
      doc.addPage();
      addPageHeader();
    }
    doc.rect(72, doc.y, doc.page.width - 144, blockHeight).fill(C.code);
    doc.y += 8;
    codeLines.forEach(cl => {
      doc.fill("#333333").fontSize(7.5).font("Courier")
        .text(cl || " ", 82, doc.y, { width: doc.page.width - 164, lineBreak: false });
      doc.y += 12;
    });
    doc.y += 8;
    codeLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // Code block
    if (line.startsWith("```")) {
      if (!inCode) { inCode = true; i++; continue; }
      else { inCode = false; flushCode(); continue; }
    }
    if (inCode) { codeLines.push(line); continue; }

    // Table
    if (line.trimStart().startsWith("|")) {
      tableRows.push(line);
      continue;
    } else if (tableRows.length > 0) {
      flushTable();
    }

    // Check if new page needed
    if (doc.y > doc.page.height - 100) {
      doc.addPage();
      addPageHeader();
    }

    // Headings
    const h1 = line.match(/^# (.+)$/);
    const h2 = line.match(/^## (.+)$/);
    const h3 = line.match(/^### (.+)$/);
    const h4 = line.match(/^#### (.+)$/);

    if (h1) {
      if (doc.y > 120) { doc.addPage(); addPageHeader(); }
      doc.rect(72, doc.y, doc.page.width - 144, 36).fill(C.navy);
      doc.fill(C.white).fontSize(20).font("Helvetica-Bold")
        .text(parseInlineForPdf(h1[1]), 80, doc.y - 30, { width: doc.page.width - 160 });
      doc.y += 12;
      continue;
    }

    if (h2) {
      doc.y += 8;
      doc.fill(C.emerald).fontSize(15).font("Helvetica-Bold")
        .text(parseInlineForPdf(h2[1]), 72, doc.y);
      doc.rect(72, doc.y + 18, doc.page.width - 144, 2).fill(C.emerald);
      doc.y += 24;
      continue;
    }

    if (h3) {
      doc.y += 6;
      doc.fill(C.navy).fontSize(12).font("Helvetica-Bold")
        .text(parseInlineForPdf(h3[1]), 72, doc.y);
      doc.y += 2;
      continue;
    }

    if (h4) {
      doc.y += 4;
      doc.fill(C.navy).fontSize(10.5).font("Helvetica-Bold")
        .text(parseInlineForPdf(h4[1]), 72, doc.y);
      doc.y += 2;
      continue;
    }

    // HR
    if (/^---+$/.test(line.trim())) {
      doc.rect(72, doc.y + 6, doc.page.width - 144, 1).fill("#CCCCCC");
      doc.y += 16;
      continue;
    }

    // List item
    const li = line.match(/^[-*] (.+)$/);
    const nli = line.match(/^(\d+)\. (.+)$/);

    if (li) {
      doc.fill(C.navy).fontSize(9).font("Helvetica")
        .text("• " + parseInlineForPdf(li[1]), 82, doc.y, { width: doc.page.width - 160 });
      doc.y += 4;
      continue;
    }

    if (nli) {
      doc.fill(C.navy).fontSize(9).font("Helvetica")
        .text(nli[1] + ". " + parseInlineForPdf(nli[2]), 82, doc.y, { width: doc.page.width - 160 });
      doc.y += 4;
      continue;
    }

    // Blockquote
    const bq = line.match(/^> (.+)$/);
    if (bq) {
      doc.rect(72, doc.y, 3, 14).fill(C.emerald);
      doc.fill(C.gray).fontSize(9).font("Helvetica-Oblique")
        .text(parseInlineForPdf(bq[1]), 82, doc.y, { width: doc.page.width - 160 });
      doc.y += 6;
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      doc.y += 6;
      continue;
    }

    // Regular paragraph
    const plainText = parseInlineForPdf(line);
    if (plainText) {
      doc.fill(C.navy).fontSize(9.5).font("Helvetica")
        .text(plainText, 72, doc.y, { width: doc.page.width - 144 });
      doc.y += 4;
    }
  }

  // Flush any remaining
  if (tableRows.length > 0) flushTable();
  if (codeLines.length > 0) flushCode();

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on("finish", () => {
      const size = fs.statSync(PDF_FILE).size;
      console.log(`PDF written to: ${PDF_FILE} (${Math.round(size / 1024)} KB)`);
      resolve();
    });
    stream.on("error", reject);
  });
}

// ─── Run ──────────────────────────────────────────────────────────────────────

async function main() {
  try {
    await generateDocx();
    await generatePdf();
    console.log("\nAll files generated successfully:");
    console.log("  docs/opportunity-os-spec.md");
    console.log("  docs/opportunity-os-spec.docx");
    console.log("  docs/opportunity-os-spec.pdf");
  } catch (err) {
    console.error("Generation failed:", err);
    process.exit(1);
  }
}

main();
