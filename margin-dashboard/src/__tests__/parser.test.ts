/**
 * Parser tests — synthetic messy fixtures (no real Excel files needed).
 *
 * We build XLSX buffers programmatically using SheetJS so we can
 * precisely control:
 *   - header row position (row 1 vs row 2)
 *   - "-" cells (should become null)
 *   - all three date formats
 *   - missing salary rows
 *   - wrong file sent (columns don't match any known type)
 */

import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseExcelBuffer, parseMonthYear } from '@/lib/parser';

// ---- Helper: build a buffer from a 2D array of values --------------------

function makeBuffer(rows: unknown[][], sheetName = 'Sheet1'): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

// ===========================================================================
// parseMonthYear unit tests
// ===========================================================================

describe('parseMonthYear', () => {
  it('parses "January 2025"', () => {
    expect(parseMonthYear('January 2025')).toEqual({ year: 2025, month: 1 });
  });
  it("parses \"January '25\"", () => {
    expect(parseMonthYear("January '25")).toEqual({ year: 2025, month: 1 });
  });
  it("parses \"Jan '25\"", () => {
    expect(parseMonthYear("Jan '25")).toEqual({ year: 2025, month: 1 });
  });
  it("parses \"May '25\"", () => {
    expect(parseMonthYear("May '25")).toEqual({ year: 2025, month: 5 });
  });
  it("parses \"December '99\" → year 2099", () => {
    expect(parseMonthYear("December '99")).toEqual({ year: 2099, month: 12 });
  });
  it('parses "January" alone → year 0 sentinel', () => {
    expect(parseMonthYear('January')).toEqual({ year: 0, month: 1 });
  });
  it('returns null for garbage', () => {
    expect(parseMonthYear('not a date')).toBeNull();
  });
  it('returns null for null input', () => {
    expect(parseMonthYear(null)).toBeNull();
  });
  it('parses JS Date object', () => {
    const d = new Date(2025, 4, 1); // May 2025
    expect(parseMonthYear(d)).toEqual({ year: 2025, month: 5 });
  });
});

// ===========================================================================
// Timesheet parser tests
// ===========================================================================

describe('parseExcelBuffer — timesheet', () => {
  const TS_HEADER = [
    'Month', 'Employee No.', 'Employee Name', 'Type of Expense',
    'Department', 'Designation', 'Category', 'Ref Code',
    'Project (Billable) / Task (Unbillable) Name',
    'Company Name (Billable)/ Fixed Costs (Unbillable)',
    'Description', 'Hours',
  ];

  it('parses a clean timesheet with "Month YYYY" date format', () => {
    const buf = makeBuffer([
      TS_HEADER,
      ['January 2025', '10201', 'Alice', 'DL', 'Design', 'Designer', 'Projects', 'Q001', 'Website', 'Acme', 'desc', 40],
    ], 'Timesheet');
    const result = parseExcelBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      year: 2025, month_num: 1, employee_no: '10201', hours: 40,
    });
  });

  it("parses timesheet with Mon 'YY date format", () => {
    const buf = makeBuffer([
      TS_HEADER,
      ["May '25", '10202', 'Bob', 'DL', 'Dev', 'Dev', 'Projects', 'Q002', 'App', 'Acme', 'desc', 30],
    ], 'Timesheet');
    const result = parseExcelBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0]).toMatchObject({ year: 2025, month_num: 5 });
  });

  it('treats "-" cells as null (hours = - → skips row with warning)', () => {
    const buf = makeBuffer([
      TS_HEADER,
      ['January 2025', '10201', 'Alice', 'DL', 'Design', 'Designer', 'Projects', '-', 'Task', 'Co', 'desc', '-'],
    ], 'Timesheet');
    const result = parseExcelBuffer(buf);
    // Hours is "-" → cannot parse → warning, row skipped
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(0);
    expect(result.warnings.some(w => w.field === 'Hours')).toBe(true);
  });

  it('treats "-" ref code as null (not as an error)', () => {
    const buf = makeBuffer([
      TS_HEADER,
      ['January 2025', '10201', 'Alice', 'DL', 'Design', 'Designer', 'FC - Meetings', '-', 'Team sync', 'Fixed Costs', 'internal', 5],
    ], 'Timesheet');
    const result = parseExcelBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ ref_code: null, hours: 5 });
  });

  it('skips completely empty rows silently', () => {
    const buf = makeBuffer([
      TS_HEADER,
      ['January 2025', '10201', 'Alice', 'DL', 'Design', 'Designer', 'Projects', 'Q001', 'Task', 'Co', 'desc', 10],
      [null, null, null, null, null, null, null, null, null, null, null, null],
      ['January 2025', '10202', 'Bob', 'DL', 'Dev', 'Dev', 'Projects', 'Q001', 'Task', 'Co', 'desc', 20],
    ], 'Timesheet');
    const result = parseExcelBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(2);
  });

  it('header in row 2 (decorative title row first)', () => {
    // First row is a title like "Timesheet 2025" — should be auto-skipped
    const buf = makeBuffer([
      ['Timesheet Data 2025', null, null, null, null, null, null, null, null, null, null, null],
      TS_HEADER,
      ['January 2025', '10201', 'Alice', 'DL', 'Design', 'Designer', 'Projects', 'Q001', 'Task', 'Co', 'desc', 8],
    ], 'Timesheet');
    const result = parseExcelBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(1);
    expect((result.rows[0] as import('@/lib/parser').ParsedTimesheetRow).employee_no).toBe('10201');
  });

  it('returns error for unknown file type', () => {
    const buf = makeBuffer([
      ['Random', 'Column', 'Names'],
      ['a', 'b', 'c'],
    ]);
    const result = parseExcelBuffer(buf);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Cannot identify file type');
  });

  it('returns error for non-Excel binary', () => {
    const result = parseExcelBuffer(Buffer.from('this is not an excel file'));
    expect(result.ok).toBe(false);
  });
});

// ===========================================================================
// Salary parser tests
// ===========================================================================

describe('parseExcelBuffer — salary', () => {
  const SAL_HEADER = [
    'Employee No.', 'Employee Name',
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  it('parses a clean salary sheet', () => {
    const buf = makeBuffer([
      SAL_HEADER,
      ['10201', 'Alice', 18000, 18000, 18000, 18000, 18000, 18000, 18500, 18500, 18500, 18500, 18500, 18500],
    ], 'Salary');
    const result = parseExcelBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 12 month rows for 1 employee
    expect(result.rows).toHaveLength(12);
    expect(result.rows[0]).toMatchObject({ employee_no: '10201', month_num: 1, salary: 18000 });
  });

  it('skips months where salary is "-" (employee on leave)', () => {
    const buf = makeBuffer([
      SAL_HEADER,
      ['10201', 'Alice', 18000, '-', 18000, '-', 18000, 18000, 18500, 18500, 18500, 18500, 18500, 18500],
    ], 'Salary');
    const result = parseExcelBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 10 months (2 dashes skipped)
    expect(result.rows).toHaveLength(10);
  });

  it('handles title row before header (like real salaries-2025.xlsx)', () => {
    const buf = makeBuffer([
      [null, 'Salary Overview 2025 (AED)', null, null, null, null, null, null, null, null, null, null, null, null],
      SAL_HEADER,
      ['10201', 'Alice', 22000, 22000, 22000, 22000, 22000, 22000, 22000, 22000, 22000, 22000, 22000, 22000],
    ], 'Salary');
    const result = parseExcelBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(12);
    expect(result.rows[0]).toMatchObject({ employee_no: '10201', salary: 22000 });
  });

  it('missing salary employee: employee with all "-" months emits warning', () => {
    const buf = makeBuffer([
      SAL_HEADER,
      ['10201', 'Alice', 18000, 18000, 18000, 18000, 18000, 18000, 18500, 18500, 18500, 18500, 18500, 18500],
      ['10299', 'Ghost', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-'],
    ], 'Salary');
    const result = parseExcelBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Only Alice's 12 rows
    expect(result.rows).toHaveLength(12);
    // Warning for Ghost
    expect(result.warnings.some(w => w.message.includes('10299') || w.message.includes('Ghost'))).toBe(true);
  });
});

// ===========================================================================
// Project prices parser tests
// ===========================================================================

describe('parseExcelBuffer — project prices', () => {
  const PROJ_HEADER = ['Ref Code', 'Project (Billable) Name', 'Project Price', 'Sales month', 'Category', 'Status'];

  it('parses clean project prices', () => {
    const buf = makeBuffer([
      PROJ_HEADER,
      ['Q2025001a', 'Website Project', 560000, "January '25", 'Projects', 'in progress'],
      ['E2025050a', 'Enhancement', 92000, "September '25", 'Enhancements', 'completed'],
    ]);
    const result = parseExcelBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ ref_code: 'Q2025001a', price: 560000 });
  });

  it('skips rows where price is missing, emits warning', () => {
    const buf = makeBuffer([
      PROJ_HEADER,
      ['Q001', 'Project A', '-', "Jan '25", 'Projects', 'in progress'],
      ['Q002', 'Project B', 100000, "Feb '25", 'Projects', 'in progress'],
    ]);
    const result = parseExcelBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(1);
    expect(result.warnings.some(w => w.field === 'Project Price')).toBe(true);
  });
});
