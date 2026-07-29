import { zipSync, strToU8 } from "fflate";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type ExportCell = number | string;
export type ExportTable = {
  columns: string[];
  rows: ExportCell[][];
  title: string;
};

function csvCell(value: ExportCell) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function exportTableToCsv(table: ExportTable) {
  return `\uFEFF${[table.columns, ...table.rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function xml(value: ExportCell) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnName(index: number) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function worksheetCell(value: ExportCell, row: number, column: number, header: boolean) {
  const reference = `${columnName(column)}${row}`;
  const style = header ? ' s="1"' : "";
  return typeof value === "number" && Number.isFinite(value)
    ? `<c r="${reference}"${style}><v>${value}</v></c>`
    : `<c r="${reference}" t="inlineStr"${style}><is><t>${xml(value)}</t></is></c>`;
}

export function exportTableToXlsx(table: ExportTable) {
  const rows = [table.columns, ...table.rows];
  const sheetRows = rows.map((row, rowIndex) => (
    `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => worksheetCell(value, rowIndex + 1, columnIndex, rowIndex === 0)).join("")}</row>`
  )).join("");
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'),
    "_rels/.rels": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    "xl/_rels/workbook.xml.rels": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
    "xl/styles.xml": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" fillId="0" borderId="0" xfId="0"/><xf fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>'),
    "xl/workbook.xml": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Financial Data" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    "xl/worksheets/sheet1.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`),
  };
  return zipSync(files, { level: 6 });
}

function printable(value: ExportCell) {
  return String(value ?? "").replace(/[^\x20-\x7E]/g, "?");
}

export async function exportTableToPdf(table: ExportTable) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 792;
  const pageHeight = 612;
  const margin = 34;
  const lineHeight = 16;
  const availableWidth = pageWidth - margin * 2;
  const columnWidth = availableWidth / Math.max(table.columns.length, 1);
  let page = document.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const drawRow = (values: ExportCell[], isHeader = false): void => {
    if (y < margin + lineHeight) {
      page = document.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
      drawRow(table.columns, true);
    }
    values.forEach((value, index) => {
      const text = printable(value);
      const maxChars = Math.max(4, Math.floor(columnWidth / 6));
      page.drawText(text.length > maxChars ? `${text.slice(0, maxChars - 1)}...` : text, {
        color: isHeader ? rgb(0.04, 0.11, 0.19) : rgb(0.27, 0.27, 0.3),
        font: isHeader ? bold : regular,
        size: isHeader ? 8 : 7,
        x: margin + index * columnWidth,
        y,
      });
    });
    y -= lineHeight;
  };

  page.drawText(printable(table.title), { font: bold, size: 16, x: margin, y });
  y -= 28;
  drawRow(table.columns, true);
  table.rows.forEach((row) => drawRow(row));
  return document.save();
}
