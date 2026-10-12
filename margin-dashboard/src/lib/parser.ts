/**
 * Excel parser — the messy-data firewall.
 *
 * Responsibilities:
 *  1. Detect which file type was uploaded by checking column fingerprints
 *     (NOT filename).
 *  2. Auto-detect the header row (first row where ≥ half non-empty cells
 *     look like column labels, not a title string).
 *  3. Normalize all three date formats:
 *       "January 2025"  → { year: 2025, month: 1 }
 *       "Jan '25"       → { year: 2025, month: 1 }
 *       "January"       → month only, year from context (used in salary cols)
 *  4. Treat any cell that is null, undefined, empty string, or exactly "-"
 *     as missing (null in DB).
 *  5. Return a typed ParseResult with rows + warnings; never throw on bad data.
 *
 * Why xlsx (SheetJS) over exceljs?
 *   - read() returns data immediately (sync), no stream plumbing needed
 *   - cellDates option parses Excel serial numbers into JS Dates automatically
 *   - Better handling of old .xls files if the client ever sends one
 */

import * as XLSX from 'xlsx';

// ---- Types -----------------------------------------------------------------

export type ParsedTimesheetRow = {
  year: number;
  month_num: number;
  month_label: string;
  employee_no: string;
  employee_name: string;
  type_of_expense: string | null;
  department: string | null;
  designation: string | null;
  category: string;
  ref_code: string | null;
  task_name: string | null;
  company: string | null;
  description: string | null;
  hours: number;
};

export type ParsedSalaryRow = {
  year: number;
  month_num: number;
  employee_no: string;
  employee_name: string;
  salary: number;
};

export type ParsedProjectRow = {
  ref_code: string;
  name: string;
  price: number;
  sales_month: string | null;
  category: string | null;
  status: string | null;
};

export type ParseWarning = {
  row: number;   // 1-based row in data (after header)
  field: string;
  message: string;
};

export type ParseResult<T> =
  | { ok: true;  rows: T[]; warnings: ParseWarning[] }
  | { ok: false; error: string; warnings: ParseWarning[] };

// ---- Column fingerprints for file-type detection ---------------------------

const TIMESHEET_REQUIRED = new Set([
  'month', 'employee no.', 'employee name', 'category', 'hours',
]);
const SALARY_REQUIRED = new Set([
  'employee no.', 'employee name', 'january',
]);
const PROJECT_REQUIRED = new Set([
  'ref code', 'project price', 'sales month',
]);

type FileType = 'timesheet' | 'salary' | 'project_prices' | 'unknown';

function detectFileType(headers: string[]): FileType {
  const lower = headers.map(h => h.toLowerCase().trim());
  const set = new Set(lower);
  if ([...TIMESHEET_REQUIRED].every(c => set.has(c))) return 'timesheet';
  if ([...SALARY_REQUIRED].every(c => set.has(c)))    return 'salary';
  if ([...PROJECT_REQUIRED].every(c => set.has(c)))   return 'project_prices';
  return 'unknown';
}

// ---- Date parsing ----------------------------------------------------------

const MONTH_NAMES: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8,
  sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Parse any of the three date formats the PDFs documented.
 * Returns null if the string can't be understood.
 */
export function parseMonthYear(raw: unknown): { year: number; month: number } | null {
  if (raw == null) return null;

  // If SheetJS gave us a JS Date (from Excel serial)
  if (raw instanceof Date) {
    return { year: raw.getFullYear(), month: raw.getMonth() + 1 };
  }

  const s = String(raw).trim();

  // Format 1: "January 2025" or "January2025"
  const fullMatch = s.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (fullMatch) {
    const month = MONTH_NAMES[fullMatch[1].toLowerCase()];
    const year  = parseInt(fullMatch[2], 10);
    if (month && year) return { year, month };
  }

  // Format 2: "Jan '25" or "January '25" or "Jan'25"
  const shortMatch = s.match(/^([A-Za-z]+)\s*'(\d{2,4})$/);
  if (shortMatch) {
    const month = MONTH_NAMES[shortMatch[1].toLowerCase()];
    let year  = parseInt(shortMatch[2], 10);
    if (year < 100) year += 2000;
    if (month && year) return { year, month };
  }

  // Format 3: "January" alone — month only, caller must supply year
  const monthOnly = MONTH_NAMES[s.toLowerCase()];
  if (monthOnly) return { year: 0, month: monthOnly }; // year=0 = sentinel

  return null;
}

// ---- Null / dash handling --------------------------------------------------

function isMissing(val: unknown): boolean {
  if (val == null) return true;
  const s = String(val).trim();
  return s === '' || s === '-';
}

function toNumber(val: unknown): number | null {
  if (isMissing(val)) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function toStr(val: unknown): string | null {
  if (isMissing(val)) return null;
  return String(val).trim();
}

// ---- Header auto-detection -------------------------------------------------

/**
 * Find the first row where ≥ half of the cells are non-empty strings
 * AND no single cell contains a long title (>60 chars).
 * This skips decorative title rows like "Salary Overview 2025 (AED)".
 */
function findHeaderRow(sheet: XLSX.WorkSheet): { headerIdx: number; headers: string[] } {
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
  for (let r = range.s.r; r <= Math.min(range.e.r, 10); r++) {
    const cells: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      cells.push(cell?.v != null ? String(cell.v).trim() : '');
    }
    const nonEmpty = cells.filter(Boolean);
    const hasLongCell = nonEmpty.some(c => c.length > 60);
    if (nonEmpty.length >= Math.max(2, cells.length / 2) && !hasLongCell) {
      return { headerIdx: r, headers: cells };
    }
  }
  return { headerIdx: 0, headers: [] };
}

// ---- Main entry point ------------------------------------------------------

export function parseExcelBuffer(
  buffer: Buffer,
): ParseResult<ParsedTimesheetRow | ParsedSalaryRow | ParsedProjectRow> {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch {
    return { ok: false, error: 'Cannot read file — not a valid Excel file.', warnings: [] };
  }

  if (!wb.SheetNames.length) {
    return { ok: false, error: 'Excel file has no sheets.', warnings: [] };
  }

  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const { headerIdx, headers } = findHeaderRow(sheet);
  const fileType = detectFileType(headers);

  if (fileType === 'unknown') {
    return {
      ok: false,
      error: `Cannot identify file type. Found columns: ${headers.filter(Boolean).join(', ')}`,
      warnings: [],
    };
  }

  // Read all rows as raw arrays
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
  const allRows: unknown[][] = [];
  for (let r = headerIdx + 1; r <= range.e.r; r++) {
    const row: unknown[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      row.push(cell?.v ?? null);
    }
    // Skip completely empty rows
    if (row.every(v => isMissing(v))) continue;
    allRows.push(row);
  }

  const colIdx = (name: string) =>
    headers.findIndex(h => h.toLowerCase().trim() === name.toLowerCase().trim());

  if (fileType === 'timesheet') {
    return parseTimesheet(allRows, headers, colIdx);
  } else if (fileType === 'salary') {
    return parseSalary(allRows, headers, colIdx);
  } else {
    return parseProjectPrices(allRows, headers, colIdx);
  }
}

// ---- Timesheet parser -------------------------------------------------------

function parseTimesheet(
  rows: unknown[][],
  _headers: string[],
  col: (name: string) => number,
): ParseResult<ParsedTimesheetRow> {
  const warnings: ParseWarning[] = [];
  const result: ParsedTimesheetRow[] = [];

  const iMonth  = col('Month');
  const iEmpNo  = col('Employee No.');
  const iEmpNm  = col('Employee Name');
  const iType   = col('Type of Expense');
  const iDept   = col('Department');
  const iDesig  = col('Designation');
  const iCat    = col('Category');
  const iRef    = col('Ref Code');
  const iTask   = col('Project (Billable) / Task (Unbillable) Name');
  const iComp   = col('Company Name (Billable)/ Fixed Costs (Unbillable)');
  const iDesc   = col('Description');
  const iHours  = col('Hours');

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 1;

    const monthRaw = r[iMonth];
    const parsed   = parseMonthYear(monthRaw);
    if (!parsed) {
      warnings.push({ row: rowNum, field: 'Month', message: `Cannot parse date: ${monthRaw}` });
      continue;
    }
    if (!parsed.year) {
      warnings.push({ row: rowNum, field: 'Month', message: `Month-only value without year: ${monthRaw}` });
      continue;
    }

    const empNo = toStr(r[iEmpNo]);
    const empNm = toStr(r[iEmpNm]);
    if (!empNo || !empNm) {
      warnings.push({ row: rowNum, field: 'Employee', message: 'Missing employee no. or name' });
      continue;
    }

    const cat = toStr(r[iCat]);
    if (!cat) {
      warnings.push({ row: rowNum, field: 'Category', message: 'Missing category' });
      continue;
    }

    const hours = toNumber(r[iHours]);
    if (hours == null) {
      warnings.push({ row: rowNum, field: 'Hours', message: `Cannot parse hours: ${r[iHours]}` });
      continue;
    }

    result.push({
      year: parsed.year,
      month_num: parsed.month,
      month_label: String(monthRaw ?? '').trim(),
      employee_no: empNo,
      employee_name: empNm,
      type_of_expense: toStr(r[iType]),
      department: toStr(r[iDept]),
      designation: toStr(r[iDesig]),
      category: cat,
      ref_code: toStr(r[iRef]),
      task_name: toStr(r[iTask]),
      company: toStr(r[iComp]),
      description: toStr(r[iDesc]),
      hours,
    });
  }

  return { ok: true, rows: result, warnings };
}

// ---- Salary parser ----------------------------------------------------------

function parseSalary(
  rows: unknown[][],
  headers: string[],
  col: (name: string) => number,
): ParseResult<ParsedSalaryRow> {
  const warnings: ParseWarning[] = [];
  const result: ParsedSalaryRow[] = [];

  // Month columns: find which header positions are month names
  const monthCols: { name: string; monthNum: number; colIdx: number }[] = [];
  headers.forEach((h, i) => {
    const lower = h.toLowerCase().trim();
    const monthNum = MONTH_NAMES[lower];
    if (monthNum) monthCols.push({ name: h, monthNum, colIdx: i });
  });

  const iEmpNo = col('Employee No.');
  const iEmpNm = col('Employee Name');

  // Detect year from the sheet title (row 0 in full sheet, not passed here)
  // We'll infer from numeric columns — year is in the config or we default to 2025.
  // Since all salary data is "2025" from the file, we'll use 2025 as default
  // and make this configurable if needed.
  // Better approach: look for 4-digit year in any header cell.
  let year = 2025;
  const yearMatch = headers.join(' ').match(/\b(20\d{2})\b/);
  if (yearMatch) year = parseInt(yearMatch[1], 10);

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 1;

    const empNo = toStr(r[iEmpNo]);
    const empNm = toStr(r[iEmpNm]);
    if (!empNo || !empNm) continue; // skip total/footer rows silently

    for (const { monthNum, colIdx } of monthCols) {
      const salary = toNumber(r[colIdx]);
      if (salary == null) {
        // "-" or missing = employee didn't work that month; skip (not an error)
        continue;
      }
      result.push({
        year,
        month_num: monthNum,
        employee_no: empNo,
        employee_name: empNm,
        salary,
      });
    }

    if (result.filter(r2 => r2.employee_no === empNo).length === 0) {
      warnings.push({ row: rowNum, field: 'salary', message: `Employee ${empNo} has no salary in any month` });
    }
  }

  return { ok: true, rows: result, warnings };
}

// ---- Project prices parser --------------------------------------------------

function parseProjectPrices(
  rows: unknown[][],
  _headers: string[],
  col: (name: string) => number,
): ParseResult<ParsedProjectRow> {
  const warnings: ParseWarning[] = [];
  const result: ParsedProjectRow[] = [];

  const iRef    = col('Ref Code');
  const iName   = col('Project (Billable) Name');
  const iPrice  = col('Project Price');
  const iSales  = col('Sales month');
  const iCat    = col('Category');
  const iStatus = col('Status');

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 1;

    const refCode = toStr(r[iRef]);
    if (!refCode) continue; // blank trailing rows

    const price = toNumber(r[iPrice]);
    if (price == null) {
      warnings.push({ row: rowNum, field: 'Project Price', message: `Missing price for ${refCode}` });
      continue;
    }

    const name = toStr(r[iName]);
    if (!name) {
      warnings.push({ row: rowNum, field: 'Project Name', message: `Missing name for ${refCode}` });
    }

    result.push({
      ref_code: refCode,
      name: name ?? refCode,
      price,
      sales_month: toStr(r[iSales]),
      category: toStr(r[iCat]),
      status: toStr(r[iStatus]),
    });
  }

  return { ok: true, rows: result, warnings };
}
