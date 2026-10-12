/**
 * POST /api/upload
 *
 * Accepts multipart/form-data with a single `file` field.
 * - Detects file type by columns (not filename).
 * - For timesheet/salary: replaces only the uploaded months; rest of year untouched.
 * - For project_prices: upserts all rows (price list has no concept of "month").
 * - Returns { ok, type, rowsInserted, warnings, gaps }.
 *
 * Why no streaming parser: these files are small (<5MB); buffering is fine
 * and keeps the code straightforward.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  parseExcelBuffer,
  ParsedTimesheetRow,
  ParsedSalaryRow,
  ParsedProjectRow,
} from '@/lib/parser';
import {
  getDb,
  deleteTimesheetMonth,
  deleteSalaryMonth,
} from '@/lib/db';


export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not parse form data.' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) {
    return NextResponse.json({ ok: false, error: 'No file uploaded.' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = parseExcelBuffer(buffer);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, warnings: result.warnings }, { status: 422 });
  }

  const { rows, warnings } = result;
  if (rows.length === 0) {
    return NextResponse.json({ ok: false, error: 'File parsed but contained no data rows.', warnings }, { status: 422 });
  }

  // Detect which type by looking at the first row shape
  const firstRow = rows[0];
  let fileType: string;
  let rowsInserted = 0;

  const db = getDb();

  if ('hours' in firstRow) {
    // Timesheet
    fileType = 'timesheet';
    const tsRows = rows as ParsedTimesheetRow[];

    // Group by (year, month_num) so we delete only the months present in this upload
    const months = new Set(tsRows.map(r => `${r.year}-${r.month_num}`));
    for (const key of months) {
      const [y, m] = key.split('-').map(Number);
      deleteTimesheetMonth(y, m);
    }

    const insert = db.prepare(`
      INSERT INTO timesheet
        (year, month_num, month_label, employee_no, employee_name,
         type_of_expense, department, designation, category, ref_code,
         task_name, company, description, hours)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMany = db.transaction((rows: ParsedTimesheetRow[]) => {
      for (const r of rows) {
        insert.run(
          r.year, r.month_num, r.month_label, r.employee_no, r.employee_name,
          r.type_of_expense, r.department, r.designation, r.category, r.ref_code,
          r.task_name, r.company, r.description, r.hours,
        );
      }
    });
    insertMany(tsRows);
    rowsInserted = tsRows.length;

  } else if ('salary' in firstRow) {
    // Salaries
    fileType = 'salary';
    const salRows = rows as ParsedSalaryRow[];

    const months = new Set(salRows.map(r => `${r.year}-${r.month_num}`));
    for (const key of months) {
      const [y, m] = key.split('-').map(Number);
      deleteSalaryMonth(y, m);
    }

    const insert = db.prepare(`
      INSERT OR REPLACE INTO salaries (year, month_num, employee_no, employee_name, salary)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertMany = db.transaction((rows: ParsedSalaryRow[]) => {
      for (const r of rows) {
        insert.run(r.year, r.month_num, r.employee_no, r.employee_name, r.salary);
      }
    });
    insertMany(salRows);
    rowsInserted = salRows.length;

  } else {
    // Project prices
    fileType = 'project_prices';
    const projRows = rows as ParsedProjectRow[];

    const upsert = db.prepare(`
      INSERT OR REPLACE INTO project_prices (ref_code, name, price, sales_month, category, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const upsertMany = db.transaction((rows: ParsedProjectRow[]) => {
      for (const r of rows) {
        upsert.run(r.ref_code, r.name, r.price, r.sales_month, r.category, r.status);
      }
    });
    upsertMany(projRows);
    rowsInserted = projRows.length;
  }

  return NextResponse.json({ ok: true, fileType, rowsInserted, warnings });
}
