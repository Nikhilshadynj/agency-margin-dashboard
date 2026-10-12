/**
 * SQLite client — single connection, synchronous (better-sqlite3).
 *
 * Schema design choices:
 *  - `timesheet` keeps one row per (month, employee_no, category, ref_code, task_name) tuple.
 *    Re-upload replaces ALL rows for a given (year, month_num) pair.
 *  - `salaries` keeps one row per (year, month_num, employee_no). Same month-level replace.
 *  - `project_prices` keeps one row per ref_code (prices don't change month-to-month).
 *  - `config` is a key-value store for user-configurable values (monthly overhead, billable categories).
 *
 * No ORM — raw SQL is easier to walk through in a live review.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'db');
const DB_PATH = path.join(DB_DIR, 'margin.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(DB_DIR, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  applySchema(_db);
  return _db;
}

function applySchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS timesheet (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      year        INTEGER NOT NULL,
      month_num   INTEGER NOT NULL,   -- 1-12
      month_label TEXT    NOT NULL,   -- e.g. "January 2025"
      employee_no TEXT    NOT NULL,
      employee_name TEXT  NOT NULL,
      type_of_expense TEXT,           -- DL | IDL
      department  TEXT,
      designation TEXT,
      category    TEXT    NOT NULL,
      ref_code    TEXT,
      task_name   TEXT,
      company     TEXT,
      description TEXT,
      hours       REAL    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS salaries (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      year        INTEGER NOT NULL,
      month_num   INTEGER NOT NULL,
      employee_no TEXT    NOT NULL,
      employee_name TEXT  NOT NULL,
      salary      REAL    NOT NULL,
      UNIQUE(year, month_num, employee_no) ON CONFLICT REPLACE
    );

    CREATE TABLE IF NOT EXISTS project_prices (
      ref_code    TEXT    PRIMARY KEY,
      name        TEXT    NOT NULL,
      price       REAL    NOT NULL,
      sales_month TEXT,               -- raw string from file, e.g. "January '25"
      category    TEXT,
      status      TEXT
    );

    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Seed default config if not present
    INSERT OR IGNORE INTO config (key, value) VALUES
      ('monthly_overhead', '0'),
      ('billable_categories', '["Projects","Enhancements","Hosting"]');
  `);

  // Indexes for the heavy join paths
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ts_month   ON timesheet (year, month_num);
    CREATE INDEX IF NOT EXISTS idx_ts_emp     ON timesheet (employee_no);
    CREATE INDEX IF NOT EXISTS idx_ts_refcode ON timesheet (ref_code);
    CREATE INDEX IF NOT EXISTS idx_sal_month  ON salaries  (year, month_num);
  `);
}

// ---- Config helpers --------------------------------------------------------

export function getConfig(key: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setConfig(key: string, value: string) {
  getDb().prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, value);
}

export function getBillableCategories(): string[] {
  const raw = getConfig('billable_categories');
  try {
    return JSON.parse(raw ?? '[]');
  } catch {
    return ['Projects', 'Enhancements', 'Hosting'];
  }
}

export function getMonthlyOverhead(): number {
  return parseFloat(getConfig('monthly_overhead') ?? '0') || 0;
}

// ---- Re-upload helpers (month-level replace) --------------------------------

export function deleteTimesheetMonth(year: number, monthNum: number) {
  getDb().prepare('DELETE FROM timesheet WHERE year = ? AND month_num = ?').run(year, monthNum);
}

export function deleteSalaryMonth(year: number, monthNum: number) {
  getDb().prepare('DELETE FROM salaries WHERE year = ? AND month_num = ?').run(year, monthNum);
}
