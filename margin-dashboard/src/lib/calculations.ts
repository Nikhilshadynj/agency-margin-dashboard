/**
 * Calculation layer — pure functions, no DB, no side effects.
 *
 * All formulas are taken exactly from the PDF:
 *
 *   direct_cost_rate   = salary ÷ total_hours  (per person, per month)
 *   indirect_cost_pool = zero-hour-staff salaries
 *                      + Σ(non_billable_hours × direct_rate)   for all others
 *                      + monthly_overhead
 *   indirect_cost_rate = indirect_cost_pool ÷ billable_hours   (per month)
 *   employee_cost      = hours × (direct_rate + indirect_rate)
 *   employee_rev_share = price × (emp_hours ÷ total_proj_hours)
 *   employee_profit    = (rev_share - emp_cost) ÷ rev_share
 *   project_profit     = (price - total_cost)   ÷ price
 *   productivity       = billable_hours ÷ total_hours
 *
 * Divide-by-zero guards: every division is wrapped; the result is null
 * (not 0, not NaN) so the UI can show "—" instead of a misleading number.
 *
 * Self-check (overhead=0): company-wide total cost should equal total salaries.
 * Run selfCheck() against your computed month data to verify.
 */

// ---- Types -----------------------------------------------------------------

export type EmployeeMonthData = {
  employee_no: string;
  employee_name: string;
  salary: number | null;        // null → no salary row (flag this)
  total_hours: number;          // all logged hours
  billable_hours: number;       // hours in billable categories
  non_billable_hours: number;
};

export type MonthInput = {
  year: number;
  month_num: number;
  employees: EmployeeMonthData[];
  overhead: number;             // user-configured monthly overhead
};

export type EmployeeRates = {
  employee_no: string;
  employee_name: string;
  salary: number | null;
  direct_rate: number | null;   // null if total_hours = 0 or no salary
  // indirect_rate comes from MonthResult
};

export type MonthResult = {
  year: number;
  month_num: number;
  indirect_cost_pool: number;
  indirect_cost_rate: number | null;  // null if billable_hours = 0
  total_billable_hours: number;
  total_hours: number;
  productivity: number | null;
  rates: EmployeeRates[];
  warnings: string[];
};

export type ProjectEmployeeRow = {
  employee_no: string;
  employee_name: string;
  hours: number;
  direct_rate: number | null;
  indirect_rate: number | null;
  cost: number | null;
  revenue_share: number | null;
  profitability: number | null;  // null if revenue_share = 0
};

export type ProjectResult = {
  ref_code: string;
  price: number | null;           // null → no price row (flag this)
  total_hours: number;
  total_cost: number | null;
  profitability: number | null;
  employees: ProjectEmployeeRow[];
  warnings: string[];
};

// ---- Safe division ---------------------------------------------------------

function safeDiv(num: number, den: number): number | null {
  if (den === 0 || !isFinite(den)) return null;
  return num / den;
}

// ---- Per-month cost rates --------------------------------------------------

export function computeMonthRates(input: MonthInput): MonthResult {
  const warnings: string[] = [];
  const { employees, overhead } = input;

  // Classify employees
  const zeroHours = employees.filter(e => e.total_hours === 0);
  const withHours = employees.filter(e => e.total_hours > 0);

  // Warn: hours logged but no salary
  for (const e of employees) {
    if (e.total_hours > 0 && e.salary == null) {
      warnings.push(`Employee ${e.employee_name} (${e.employee_no}) has hours but no salary — cost will be underestimated.`);
    }
    if (e.total_hours === 0 && e.salary != null) {
      // Support staff — logged nowhere but has salary; included in indirect pool
    }
  }

  // Step 1: direct rate per employee
  const ratesMap: Record<string, EmployeeRates> = {};
  for (const e of employees) {
    const direct_rate = e.total_hours > 0 && e.salary != null
      ? e.salary / e.total_hours
      : null;

    if (e.total_hours > 0 && e.salary == null) {
      // We can't compute a rate; flag is already added above
    }

    ratesMap[e.employee_no] = {
      employee_no: e.employee_no,
      employee_name: e.employee_name,
      salary: e.salary,
      direct_rate,
    };
  }

  // Step 2: indirect cost pool
  //   = zero-hours staff salaries
  //   + Σ(non_billable_hours × direct_rate) for everyone else
  //   + overhead
  let indirect_pool = overhead;

  for (const e of zeroHours) {
    if (e.salary != null) indirect_pool += e.salary;
  }

  for (const e of withHours) {
    const rate = ratesMap[e.employee_no].direct_rate;
    if (rate != null) {
      indirect_pool += e.non_billable_hours * rate;
    }
    // If rate is null (no salary), non-billable hours contribute 0 to pool
    // — but we already warned about this above
  }

  // Step 3: total billable hours
  const total_billable = employees.reduce((s, e) => s + e.billable_hours, 0);
  const total_all      = employees.reduce((s, e) => s + e.total_hours, 0);

  // Step 4: indirect cost rate
  const indirect_rate = safeDiv(indirect_pool, total_billable);

  if (total_billable === 0) {
    warnings.push(`No billable hours in ${input.year}-${String(input.month_num).padStart(2,'0')} — indirect cost rate is undefined.`);
  }
  if (total_all === 0) {
    warnings.push(`No hours at all in ${input.year}-${String(input.month_num).padStart(2,'0')}.`);
  }

  return {
    year: input.year,
    month_num: input.month_num,
    indirect_cost_pool: indirect_pool,
    indirect_cost_rate: indirect_rate,
    total_billable_hours: total_billable,
    total_hours: total_all,
    productivity: safeDiv(total_billable, total_all),
    rates: Object.values(ratesMap),
    warnings,
  };
}

// ---- Project profitability -------------------------------------------------

export function computeProjectResult(
  refCode: string,
  price: number | null,
  // rows: one per (employee, month) with their rates already computed
  rows: Array<{
    employee_no: string;
    employee_name: string;
    hours: number;
    direct_rate: number | null;
    indirect_rate: number | null;
  }>,
): ProjectResult {
  const warnings: string[] = [];

  if (price == null) {
    warnings.push(`Project ${refCode} has no price — profitability cannot be computed.`);
  }

  // Aggregate by employee (a project can span multiple months)
  const byEmp: Record<string, {
    employee_no: string;
    employee_name: string;
    hours: number;
    cost: number | null;
    hasNullRate: boolean;
  }> = {};

  let totalHours = 0;

  for (const row of rows) {
    totalHours += row.hours;
    if (!byEmp[row.employee_no]) {
      byEmp[row.employee_no] = {
        employee_no: row.employee_no,
        employee_name: row.employee_name,
        hours: 0,
        cost: 0,
        hasNullRate: false,
      };
    }
    const agg = byEmp[row.employee_no];
    agg.hours += row.hours;

    // Cost for this specific time-slice
    if (row.direct_rate != null && row.indirect_rate != null) {
      agg.cost = (agg.cost ?? 0) + row.hours * (row.direct_rate + row.indirect_rate);
    } else {
      agg.hasNullRate = true;
      agg.cost = null; // once null, stays null
    }
  }

  // Build employee rows with revenue share
  const empRows: ProjectEmployeeRow[] = Object.values(byEmp).map(e => {
    const rev_share = price != null ? safeDiv(price * e.hours, totalHours) : null;
    const profitability = rev_share != null && e.cost != null
      ? safeDiv(rev_share - e.cost, rev_share)
      : null;

    if (e.hasNullRate) {
      warnings.push(`Employee ${e.employee_name} on ${refCode} has missing rate(s) — cost is approximate.`);
    }

    return {
      employee_no: e.employee_no,
      employee_name: e.employee_name,
      hours: e.hours,
      direct_rate: rows.find(r => r.employee_no === e.employee_no)?.direct_rate ?? null,
      indirect_rate: rows.find(r => r.employee_no === e.employee_no)?.indirect_rate ?? null,
      cost: e.cost,
      revenue_share: rev_share,
      profitability,
    };
  });

  const totalCost = empRows.every(e => e.cost != null)
    ? empRows.reduce((s, e) => s + (e.cost ?? 0), 0)
    : null;

  const projectProfitability = totalCost != null && price != null
    ? safeDiv(price - totalCost, price)
    : null;

  return {
    ref_code: refCode,
    price,
    total_hours: totalHours,
    total_cost: totalCost,
    profitability: projectProfitability,
    employees: empRows,
    warnings,
  };
}

// ---- Self-check ------------------------------------------------------------

export type SelfCheckResult = {
  passed: boolean;
  total_salaries: number;
  total_cost: number;
  difference: number;   // should be 0 when overhead=0
  per_month: Array<{
    year: number;
    month_num: number;
    salaries: number;
    cost: number;
    ok: boolean;
  }>;
};

/**
 * Self-check: with overhead=0, total cost must equal total salaries to the dirham.
 *
 * How it works:
 *   total_cost per employee per month
 *     = hours × (direct_rate + indirect_rate)
 *   direct contribution  = billable_hours × direct_rate  (for billable hours)
 *                        + non_billable_hours × direct_rate
 *                        = total_hours × direct_rate
 *                        = total_hours × (salary / total_hours)
 *                        = salary                          ← always true
 *   indirect contribution = billable_hours × indirect_rate
 *                         = billable_hours × (pool / billable_hours)
 *                         = pool
 *                         = Σ(non_billable × direct_rate) + zero-staff salaries
 *                         = [already accounted for in direct contributions]
 *
 * So the algebra guarantees this if implemented correctly. This check catches
 * bugs like double-counting or wrong formula wiring.
 */
export function selfCheck(
  monthInputs: MonthInput[],
  monthResults: MonthResult[],
): SelfCheckResult {
  const perMonth = monthInputs.map((input, i) => {
    const result = monthResults[i];
    const salaries = input.employees.reduce((s, e) => s + (e.salary ?? 0), 0);

    // Total absorbed project cost = Σ_employees(billable_hours × (direct + indirect))
    let cost = 0;
    for (const e of input.employees) {
      const rate = result.rates.find(r => r.employee_no === e.employee_no);
      const direct = rate?.direct_rate ?? 0;
      const indirect = result.indirect_cost_rate ?? 0;
      cost += e.billable_hours * (direct + indirect);
    }

    // Round to 2 decimal places to handle floating-point noise
    const diff = Math.abs(Math.round((cost - salaries) * 100) / 100);
    return {
      year: input.year,
      month_num: input.month_num,
      salaries,
      cost: Math.round(cost * 100) / 100,
      ok: diff < 0.01,
    };
  });

  const total_salaries = perMonth.reduce((s, m) => s + m.salaries, 0);
  const total_cost     = perMonth.reduce((s, m) => s + m.cost, 0);
  const difference     = Math.abs(Math.round((total_cost - total_salaries) * 100) / 100);

  return {
    passed: perMonth.every(m => m.ok),
    total_salaries,
    total_cost,
    difference,
    per_month: perMonth,
  };
}

// ---- Employee productivity (for Productivity page) -------------------------

export type EmployeeProductivity = {
  employee_no: string;
  employee_name: string;
  department: string | null;
  designation: string | null;
  total_hours: number;
  billable_hours: number;
  productivity: number | null;
};
