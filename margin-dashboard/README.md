# Agency Margin Engine & Cost Absorption Dashboard

An executive financial dashboard and cost-absorption engine built to calculate true client project profitability, employee direct/indirect rates, and company-wide margin reconciliation down to the dirham.

---

## 🚀 5-Minute Quickstart

### Prerequisites
- Node.js 18+ (tested on Node v24)
- npm

### 1. Clone & Install
```bash
cd margin-dashboard
npm install
```

### 2. Ingest Sample Data & Run Reconciliation Self-Check
```bash
npm run seed
```
This parses the 3 spreadsheets (`timesheet-2025.xlsx`, `salaries-2025.xlsx`, `project-prices-2025.xlsx`) from `../data`, populates the local SQLite database (`db/margin.db`), and prints the month-by-month reconciliation check to your terminal.

### 3. Run Development Server
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

### 4. Run Unit Tests
```bash
npm test
```
Runs 38 unit tests covering formula calculations, divide-by-zero guards, and synthetic messy spreadsheet edge cases.

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
