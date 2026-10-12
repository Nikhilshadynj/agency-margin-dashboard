import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { parseExcelBuffer, ParsedTimesheetRow, ParsedSalaryRow, ParsedProjectRow } from './parser';

/**
 * Ensures sample-data is ingested into the SQLite database if the tables are completely empty.
 * If timesheet rows already exist, skips seeding completely to protect user-uploaded data.
 */
export function ensureDataSeeded(db: Database.Database) {
  try {
    const row = db.prepare('SELECT COUNT(*) as count FROM timesheet').get() as { count: number } | undefined;
    if (row && row.count > 0) {
      return; // Already has data, never overwrite user uploads!
    }

    const sampleDir = path.join(process.cwd(), 'sample-data');
    const projFile = path.join(sampleDir, 'project-prices-2025.xlsx');
    const salFile = path.join(sampleDir, 'salaries-2025.xlsx');
    const tsFile = path.join(sampleDir, 'timesheet-2025.xlsx');

    if (!fs.existsSync(projFile) || !fs.existsSync(salFile) || !fs.existsSync(tsFile)) {
      return; // Sample files not found, do nothing
    }

    // 1. Ingest Project Prices
    const projBuf = fs.readFileSync(projFile);
    const projRes = parseExcelBuffer(projBuf);
    if (projRes.ok) {
      const upsertProj = db.prepare(`
        INSERT OR REPLACE INTO project_prices (ref_code, name, price, sales_month, category, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      db.transaction(() => {
        for (const r of projRes.rows as ParsedProjectRow[]) {
          upsertProj.run(r.ref_code, r.name, r.price, r.sales_month, r.category, r.status);
        }
      })();
    }

    // 2. Ingest Salaries
    const salBuf = fs.readFileSync(salFile);
    const salRes = parseExcelBuffer(salBuf);
    if (salRes.ok) {
      const insertSal = db.prepare(`
        INSERT OR REPLACE INTO salaries (year, month_num, employee_no, employee_name, salary)
        VALUES (?, ?, ?, ?, ?)
      `);
      db.transaction(() => {
        for (const r of salRes.rows as ParsedSalaryRow[]) {
          insertSal.run(r.year, r.month_num, r.employee_no, r.employee_name, r.salary);
        }
      })();
    }

    // 3. Ingest Timesheet
    const tsBuf = fs.readFileSync(tsFile);
    const tsRes = parseExcelBuffer(tsBuf);
    if (tsRes.ok) {
      const insertTs = db.prepare(`
        INSERT INTO timesheet
          (year, month_num, month_label, employee_no, employee_name,
           type_of_expense, department, designation, category, ref_code,
           task_name, company, description, hours)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      db.transaction(() => {
        for (const r of tsRes.rows as ParsedTimesheetRow[]) {
          insertTs.run(
            r.year, r.month_num, r.month_label, r.employee_no, r.employee_name,
            r.type_of_expense, r.department, r.designation, r.category, r.ref_code,
            r.task_name, r.company, r.description, r.hours
          );
        }
      })();
    }
  } catch (err) {
    console.error('Error in ensureDataSeeded:', err);
  }
}
