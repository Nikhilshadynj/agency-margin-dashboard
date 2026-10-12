# Agency Margin Engine & Cost Absorption Dashboard

An executive financial dashboard and cost-absorption engine built to calculate true client project profitability, employee direct/indirect rates, and company-wide margin reconciliation down to the dirham.

---

## 🚀 5-Minute Quickstart

### Prerequisites
- Node.js 18+ (tested on Node v24)
- npm

### 1. Clone & Install
You can install dependencies directly from the root repository or inside `margin-dashboard/`:

```bash
# Option A: From root
npm run install:all

# Option B: From project directory
cd margin-dashboard
npm install
```

### 2. Run Development Server (Auto-Seeded)
```bash
# From root (or inside margin-dashboard):
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

> **Automatic Sample Seeding:** When you boot up a fresh clone, the system detects that the local SQLite database is empty and automatically ingests the sample spreadsheets from `sample-data/`. The dashboard will immediately open fully populated with all 11 client contracts, 12 employees, and full-year financial figures.

### 3. Optional: Manual Re-Seed & Reconciliation Verification
```bash
# From root (or inside margin-dashboard):
npm run seed
```
This re-runs the seed script against `sample-data/` and prints the month-by-month reconciliation check to your terminal.

### 4. Run Unit Tests
```bash
# From root (or inside margin-dashboard):
npm run test
```
Runs 38 unit tests covering formula calculations, divide-by-zero guards, and synthetic messy spreadsheet edge cases.

---

## ⚙️ How Auto-Seeding & Persistence Work

1. **First Run (Empty DB):**
   - On the very first request (or server boot), `getDb()` initializes `db/margin.db` and applies the schema.
   - `ensureDataSeeded()` checks `SELECT COUNT(*) FROM timesheet`. If the count is 0, it reads the 3 sample Excel files from `sample-data/` (`timesheet-2025.xlsx`, `salaries-2025.xlsx`, `project-prices-2025.xlsx`) and populates the database.
2. **Subsequent Runs (User Data Protection):**
   - If `timesheet` already has records (including files uploaded by the user through the UI), the auto-seed routine **completely exits**.
   - It will **never overwrite, delete, or reset** existing data or user uploads.
3. **Re-upload Safety:**
   - When a corrected month is uploaded via the UI modal, only that specific `(year, month)` pair is replaced; other months and custom records remain intact.

---

## 📐 The Mathematical Model

All calculations are implemented strictly according to the brief:

1. **Direct Cost Rate / hour** *(per employee, per month)*:
   $$\text{Direct Rate} = \frac{\text{Monthly Salary}}{\text{Total Hours Logged That Month}}$$

2. **Indirect Cost Pool** *(per month)*:
   $$\text{Indirect Pool} = \text{Salaries of 0-hour staff} + \sum (\text{Non-Billable Hours} \times \text{Direct Rate}) + \text{Monthly Overhead}$$

3. **Indirect Cost Rate / hour** *(per month)*:
   $$\text{Indirect Rate} = \frac{\text{Indirect Cost Pool}}{\text{Total Billable Hours That Month}}$$

4. **Employee Cost on a Project**:
   $$\text{Cost} = \text{Project Hours} \times (\text{Direct Rate} + \text{Indirect Rate})$$

5. **Employee Revenue Share**:
   $$\text{Revenue Share} = \text{Contract Price} \times \frac{\text{Employee Hours}}{\text{Total Project Hours}}$$

6. **Employee Profitability**:
   $$\text{Profitability} = \frac{\text{Revenue Share} - \text{Employee Cost}}{\text{Revenue Share}}$$

7. **Project Profitability / Gross Margin**:
   $$\text{Project Margin} = \frac{\text{Contract Price} - \text{Total Absorbed Project Cost}}{\text{Contract Price}}$$

8. **Productivity Ratio**:
   $$\text{Productivity} = \frac{\text{Billable Hours}}{\text{Total Logged Hours}}$$

---

## 🔍 Self-Check Invariant Proof (Reconciled to the Dirham)

The self-check requires that with $\text{Overhead} = 0$, the total absorbed cost across all billable project hours must match total payroll salaries:

$$\sum_{\text{employees}} \text{Billable Hours} \times (\text{Direct Rate} + \text{Indirect Rate}) = \text{Total Salaries}$$

**Why the algebra holds:**
- Direct portion absorbed on billable work: $\sum (\text{Billable Hours} \times \text{Direct Rate})$.
- Indirect rate is defined as: $\frac{\text{Indirect Pool}}{\text{Total Billable Hours}}$.
- Multiplying by $\text{Total Billable Hours}$ yields the **Indirect Pool**, which is: $\sum (\text{Non-Billable Hours} \times \text{Direct Rate}) + \text{Zero-hour Salaries}$.
- Adding both gives:
  $$\sum ([\text{Billable} + \text{Non-Billable}] \times \text{Direct Rate}) + \text{Zero-hour Salaries} = \sum (\text{Total Hours} \times \frac{\text{Salary}}{\text{Total Hours}}) + \text{Zero-hour Salaries} = \text{Total Salaries}$$

**Result on 2025 Data:**
- Full Year Salaries: **AED 2,400,000**
- Full Year Absorbed Cost: **AED 2,400,000**
- Variance: **AED 0.00 (Exact to the fils)**

---

## 🧠 Assumptions & Design Decisions

1. **Billability is Category-Driven, Not DL/IDL:**
   - In `timesheet-2025.xlsx`, cross-tab analysis showed that certain Fixed Cost categories (`FC - Meetings`, `FC - Leaves`, `FC - Idle`) contain rows marked with `DL` (Direct Labour). This reflects direct production staff spending time on internal activities.
   - Therefore, billability is determined strictly by the category (`Projects`, `Enhancements`, `Hosting`). `Tentwenty` is an internal agency product initiative (marked `Fixed Costs` with no ref code or contract price), hence treated as non-billable overhead.
2. **Re-upload Semantics (Month-level Replace):**
   - Uploading a timesheet or salary spreadsheet for a specific month replaces only that `(year, month)` pair. Rows for all other months remain untouched.
   - Project prices are upserted by `Ref Code` (contract prices are perennial).
3. **Column Fingerprint File Detection:**
   - Files are never identified by filename (e.g. `timesheet.xlsx`). The parser checks the presence of characteristic header columns, making it immune to renames.
4. **Header Row Auto-Detection:**
   - The parser inspects the first 10 rows and skips decorative title rows (such as row 1 in `salaries-2025.xlsx` which contains `"Salary Overview 2025 (AED)"`).
5. **Irregular Date Format Normalization:**
   - Supports `"Month YYYY"` (e.g. `January 2025`), `"Mon 'YY"` (e.g. `May '25`), and Excel serial numeric dates.
6. **Hyphen (`"-"`) & Empty Cell Handling:**
   - Any cell containing `"-"`, whitespace, or empty string is cast to `null`. If numerical fields (like hours) are missing, the row emits a structured warning rather than crashing.

---

## ⚠️ Known Limitations & What I'm Not Happy With

To be completely honest about architectural decisions and constraints:

1. **Project Revenue Recognition is Whole-Contract, Not Pro-Rata / Accrued:**
   - In the data, `project_prices` provides a single total contract price per project (e.g., AED 560,000 for Meridian).
   - In the monthly view, revenue is attributed based on whether a project was active in that month. In real-world accounting, projects spanning 6 months would recognize revenue pro-rata against percentage of completion or milestones. Because milestones were not present in the brief, project price is treated as a lump sum.
2. **Single SQLite Database Connection File (Concurrency):**
   - We used `better-sqlite3` with WAL mode enabled, which is synchronous and fast for a local deployment. However, SQLite does not support distributed writes. If multiple administrators upload 50MB spreadsheets simultaneously, write transactions are serialized.
3. **Client-Side State vs URL Search Params:**
   - On the Dashboard, Year and Month filters currently use React component state rather than syncing to browser URL search params (`?year=2025&month=5`). Bookmarking or sharing a deep link to a specific month filter requires an extra click.
4. **Hardcoded Initial Year Fallback in Parser:**
   - In `src/lib/parser.ts`, the salary parser infers the year by searching headers for a 4-digit number (e.g., `2025`) and defaults to `2025` if no 4-digit year is found in the headers. While effective for the provided dataset, a strictly dynamic multi-year salary sheet without header year labels would require user input.

---

## 📋 What Was Built vs What Was Cut

### Built:
- **Executive Overview Dashboard**: Total logged time, billable time, absorbed cost, booked revenue, gross margin %, live reconciliation indicator, overhead configurator.
- **Project Exploration**: 11 contracts with status, contract prices, absorbed cost, margin %, and detail drill-down.
- **Project Detail Page**: Hours by department visual breakdown and per-employee contribution table (revenue share vs absorbed cost).
- **Team Productivity Page**: Ranked employee productivity table with visual utilization bars.
- **Time Allocation Page**: Hours per category breakdown (billable vs overhead absorption).
- **Upload API & Modal**: Handles file ingestion, replaces months safely, displays live parse warnings.
- **Comprehensive Test Suite**: 38 Vitest tests with synthetic dirty-data fixtures.

### Cut / What I Would Build Next:
- **Employee $\times$ Category Cross-Tab Matrix**: The finance pivot table currently generated manually.
- **Audit Rate Derivation Modal**: An interactive breakdown for any selected month showing the exact pool breakdown formula.
- **CSV / Excel Export**: One-click export for finance reporting.
- **Multi-Year Side-by-Side Comparison**: Comparing 2024 vs 2025 vs 2026 contract efficiency.
