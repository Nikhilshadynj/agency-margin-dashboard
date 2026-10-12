/**
 * Database query helpers — thin wrappers over raw SQL.
 * Called from API routes; never called from client components.
 *
 * All functions accept optional { year, monthNum } filters.
 * When both are provided → single month. Year only → full year. Neither → all data.
 */

import { getDb, getBillableCategories } from './db';

export type TimesheetFilter = {
  year?: number;
  month?: number; // 1-12
};

// ---- Timesheet queries -----------------------------------------------------

export function getTimesheetRows(filter: TimesheetFilter = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM timesheet WHERE 1=1';
  const params: unknown[] = [];
  if (filter.year)  { sql += ' AND year = ?';      params.push(filter.year); }
  if (filter.month) { sql += ' AND month_num = ?'; params.push(filter.month); }
  return db.prepare(sql).all(...params) as TimesheetRow[];
}

export type TimesheetRow = {
  id: number;
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

// ---- Salary queries --------------------------------------------------------

export type SalaryRow = {
  id: number;
  year: number;
  month_num: number;
  employee_no: string;
  employee_name: string;
  salary: number;
};

export function getSalaryRows(filter: TimesheetFilter = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM salaries WHERE 1=1';
  const params: unknown[] = [];
  if (filter.year)  { sql += ' AND year = ?';      params.push(filter.year); }
  if (filter.month) { sql += ' AND month_num = ?'; params.push(filter.month); }
  return db.prepare(sql).all(...params) as SalaryRow[];
}

// ---- Project price queries -------------------------------------------------

export type ProjectPriceRow = {
  ref_code: string;
  name: string;
  price: number;
  sales_month: string | null;
  category: string | null;
  status: string | null;
};

export function getProjectPrices(refCode?: string) {
  const db = getDb();
  if (refCode) {
    return db.prepare('SELECT * FROM project_prices WHERE ref_code = ?').get(refCode) as ProjectPriceRow | undefined;
  }
  return db.prepare('SELECT * FROM project_prices ORDER BY ref_code').all() as ProjectPriceRow[];
}

// ---- Available years/months in data ----------------------------------------

export function getAvailableYears(): number[] {
  const db = getDb();
  return (db.prepare('SELECT DISTINCT year FROM timesheet ORDER BY year').all() as { year: number }[]).map(r => r.year);
}

export function getAvailableMonths(year: number): number[] {
  const db = getDb();
  return (db.prepare('SELECT DISTINCT month_num FROM timesheet WHERE year = ? ORDER BY month_num').all(year) as { month_num: number }[]).map(r => r.month_num);
}

// ---- Dashboard summary (aggregated in SQL for speed) -----------------------

export type DashboardSummary = {
  total_hours: number;
  billable_hours: number;
  non_billable_hours: number;
};

export function getDashboardHours(filter: TimesheetFilter = {}): DashboardSummary {
  const db = getDb();
  const billable = getBillableCategories();
  const placeholders = billable.map(() => '?').join(',');

  let baseSql = 'FROM timesheet WHERE 1=1';
  const params: unknown[] = [];
  if (filter.year)  { baseSql += ' AND year = ?';      params.push(filter.year); }
  if (filter.month) { baseSql += ' AND month_num = ?'; params.push(filter.month); }

  const total = (db.prepare(`SELECT COALESCE(SUM(hours),0) as v ${baseSql}`).get(...params) as { v: number }).v;
  const bill  = (db.prepare(`SELECT COALESCE(SUM(hours),0) as v ${baseSql} AND category IN (${placeholders})`).get(...params, ...billable) as { v: number }).v;

  return { total_hours: total, billable_hours: bill, non_billable_hours: total - bill };
}

// ---- Data gaps: employees with hours but no salary -------------------------

export type DataGap = {
  type: 'hours_no_salary' | 'hours_no_price';
  employee_no?: string;
  employee_name?: string;
  ref_code?: string;
  year?: number;
  month_num?: number;
};

export function getDataGaps(filter: TimesheetFilter = {}): DataGap[] {
  const db = getDb();
  const gaps: DataGap[] = [];

  // Hours but no salary
  let sql = `
    SELECT DISTINCT t.year, t.month_num, t.employee_no, t.employee_name
    FROM timesheet t
    WHERE NOT EXISTS (
      SELECT 1 FROM salaries s
      WHERE s.year = t.year AND s.month_num = t.month_num AND s.employee_no = t.employee_no
    )
  `;
  const params: unknown[] = [];
  if (filter.year)  { sql += ' AND t.year = ?';      params.push(filter.year); }
  if (filter.month) { sql += ' AND t.month_num = ?'; params.push(filter.month); }

  const noSalary = db.prepare(sql).all(...params) as { year: number; month_num: number; employee_no: string; employee_name: string }[];
  for (const r of noSalary) {
    gaps.push({ type: 'hours_no_salary', ...r });
  }

  // Billable hours but no price
  const billable = getBillableCategories();
  const ph = billable.map(() => '?').join(',');
  let sql2 = `
    SELECT DISTINCT t.ref_code
    FROM timesheet t
    WHERE t.category IN (${ph})
      AND t.ref_code IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM project_prices p WHERE p.ref_code = t.ref_code)
  `;
  const params2: unknown[] = [...billable];
  if (filter.year)  { sql2 += ' AND t.year = ?';      params2.push(filter.year); }
  if (filter.month) { sql2 += ' AND t.month_num = ?'; params2.push(filter.month); }

  const noPrice = db.prepare(sql2).all(...params2) as { ref_code: string }[];
  for (const r of noPrice) {
    gaps.push({ type: 'hours_no_price', ref_code: r.ref_code });
  }

  return gaps;
}
