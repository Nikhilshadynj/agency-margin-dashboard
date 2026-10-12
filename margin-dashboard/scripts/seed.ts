/**
 * Seed module: reads the 3 Excel files from sample-data/ directory
 * and ingests them into the SQLite database.
 * If force=false and database already has records, skips seeding to preserve user data.
 */

import fs from 'fs';
import path from 'path';
import { parseExcelBuffer, ParsedTimesheetRow, ParsedSalaryRow, ParsedProjectRow } from '../src/lib/parser';
import { getDb, deleteTimesheetMonth, deleteSalaryMonth, getBillableCategories } from '../src/lib/db';
import { getTimesheetRows, getSalaryRows } from '../src/lib/queries';
import { computeMonthRates, selfCheck, MonthInput } from '../src/lib/calculations';

const SAMPLE_DATA_DIR = path.resolve(__dirname, '../sample-data');

function loadFile(filename: string): Buffer {
  const filepath = path.join(SAMPLE_DATA_DIR, filename);
  if (!fs.existsSync(filepath)) {
    // Fallback if running from a different context
    const fallbackPath = path.resolve(process.cwd(), 'sample-data', filename);
    if (fs.existsSync(fallbackPath)) {
      return fs.readFileSync(fallbackPath);
    }
    throw new Error(`Sample file not found: ${filepath} (or ${fallbackPath})`);
  }
  return fs.readFileSync(filepath);
}

export function autoSeedIfEmpty(): boolean {
  const db = getDb();
  const countRow = db.prepare('SELECT COUNT(*) as count FROM timesheet').get() as { count: number };
  if (countRow && countRow.count > 0) {
    // Database already has records, do not overwrite user data!
    return false;
  }

  console.log('[AutoSeed] Empty database detected. Ingesting sample data from sample-data/ ...');
  runSeedSync(false);
  return true;
}

export function runSeedSync(verbose = true) {
  const db = getDb();

  // 1. Ingest Project Prices
  if (verbose) console.log('Parsing project-prices-2025.xlsx...');
  const projBuf = loadFile('project-prices-2025.xlsx');
  const projRes = parseExcelBuffer(projBuf);
  if (!projRes.ok) throw new Error(projRes.error);
  const projRows = projRes.rows as ParsedProjectRow[];

  const upsertProj = db.prepare(`
    INSERT OR REPLACE INTO project_prices (ref_code, name, price, sales_month, category, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  db.transaction(() => {
    for (const r of projRows) {
      upsertProj.run(r.ref_code, r.name, r.price, r.sales_month, r.category, r.status);
    }
  })();
  if (verbose) console.log(`✓ Inserted/Updated ${projRows.length} project price rows.`);

  // 2. Ingest Salaries
  if (verbose) console.log('Parsing salaries-2025.xlsx...');
  const salBuf = loadFile('salaries-2025.xlsx');
  const salRes = parseExcelBuffer(salBuf);
  if (!salRes.ok) throw new Error(salRes.error);
  const salRows = salRes.rows as ParsedSalaryRow[];

  const monthsSal = new Set(salRows.map(r => `${r.year}-${r.month_num}`));
  for (const m of monthsSal) {
    const [y, mn] = m.split('-').map(Number);
    deleteSalaryMonth(y, mn);
  }
  const insertSal = db.prepare(`
    INSERT OR REPLACE INTO salaries (year, month_num, employee_no, employee_name, salary)
    VALUES (?, ?, ?, ?, ?)
  `);
  db.transaction(() => {
    for (const r of salRows) {
      insertSal.run(r.year, r.month_num, r.employee_no, r.employee_name, r.salary);
    }
  })();
  if (verbose) console.log(`✓ Inserted ${salRows.length} salary records across months.`);

  // 3. Ingest Timesheet
  if (verbose) console.log('Parsing timesheet-2025.xlsx...');
  const tsBuf = loadFile('timesheet-2025.xlsx');
  const tsRes = parseExcelBuffer(tsBuf);
  if (!tsRes.ok) throw new Error(tsRes.error);
  const tsRows = tsRes.rows as ParsedTimesheetRow[];

  const monthsTs = new Set(tsRows.map(r => `${r.year}-${r.month_num}`));
  for (const m of monthsTs) {
    const [y, mn] = m.split('-').map(Number);
    deleteTimesheetMonth(y, mn);
  }
  const insertTs = db.prepare(`
    INSERT INTO timesheet
      (year, month_num, month_label, employee_no, employee_name,
       type_of_expense, department, designation, category, ref_code,
       task_name, company, description, hours)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  db.transaction(() => {
    for (const r of tsRows) {
      insertTs.run(
        r.year, r.month_num, r.month_label, r.employee_no, r.employee_name,
        r.type_of_expense, r.department, r.designation, r.category, r.ref_code,
        r.task_name, r.company, r.description, r.hours
      );
    }
  })();
  if (verbose) console.log(`✓ Inserted ${tsRows.length} timesheet rows across months.`);

  // 4. Verification Check
  if (verbose) {
    console.log('\n--- Running Self-Check Reconciliation (Overhead = 0) ---');
    const billable = getBillableCategories();
    const allTs = getTimesheetRows({ year: 2025 });
    const allSal = getSalaryRows({ year: 2025 });

    const monthKeys = [...new Set(allTs.map(r => `${r.year}-${r.month_num}`))].sort((a,b) => {
      const [ya, ma] = a.split('-').map(Number);
      const [yb, mb] = b.split('-').map(Number);
      return ya !== yb ? ya - yb : ma - mb;
    });

    const monthInputs: MonthInput[] = monthKeys.map(key => {
      const [y, m] = key.split('-').map(Number);
      const monthTs = allTs.filter(r => r.year === y && r.month_num === m);
      const monthSal = allSal.filter(r => r.year === y && r.month_num === m);

      const empNos = [...new Set([...monthTs.map(r => r.employee_no), ...monthSal.map(r => r.employee_no)])];
      const employees = empNos.map(empNo => {
        const empRows = monthTs.filter(r => r.employee_no === empNo);
        const salRow = monthSal.find(r => r.employee_no === empNo);
        const totalH = empRows.reduce((s, r) => s + r.hours, 0);
        const billableH = empRows.filter(r => billable.includes(r.category)).reduce((s, r) => s + r.hours, 0);
        return {
          employee_no: empNo,
          employee_name: empRows[0]?.employee_name ?? salRow?.employee_name ?? empNo,
          salary: salRow?.salary ?? null,
          total_hours: totalH,
          billable_hours: billableH,
          non_billable_hours: totalH - billableH,
        };
      });

      return { year: y, month_num: m, employees, overhead: 0 };
    });

    const monthResults = monthInputs.map(input => computeMonthRates(input));
    const check = selfCheck(monthInputs, monthResults);

    console.log('\nMonth-by-Month Reconciliation:');
    console.log('Month   | Total Salaries (AED) | Total Cost (AED) | Match?');
    console.log('---------------------------------------------------------');
    for (const m of check.per_month) {
      const monthStr = `${m.year}-${String(m.month_num).padStart(2, '0')}`;
      const status = m.ok ? '✅ PASS' : '❌ FAIL';
      console.log(`${monthStr} | ${m.salaries.toLocaleString().padStart(20)} | ${m.cost.toLocaleString().padStart(16)} | ${status}`);
    }

    console.log('---------------------------------------------------------');
    console.log(`Full Year Salaries: AED ${check.total_salaries.toLocaleString()}`);
    console.log(`Full Year Cost    : AED ${check.total_cost.toLocaleString()}`);
    console.log(`Difference        : AED ${check.difference}`);
    console.log(`Result            : ${check.passed ? '🎉 PASSED TO THE DIRHAM!' : '❌ RECONCILIATION FAILED'}`);

    if (!check.passed) {
      process.exit(1);
    }
  }
}

// CLI direct execution
if (require.main === module) {
  runSeedSync(true);
}
