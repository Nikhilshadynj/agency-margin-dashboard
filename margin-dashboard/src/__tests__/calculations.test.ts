/**
 * Calculation layer tests — pure function tests, no DB.
 *
 * Key invariants tested:
 *   1. selfCheck: overhead=0 → total cost = total salaries (to the dirham)
 *   2. Divide-by-zero: no billable hours → indirect_rate = null (not NaN/Inf)
 *   3. Zero total hours → direct_rate = null
 *   4. Project profitability math matches manual calculation
 *   5. Employee revenue share sums to project price
 *   6. selfCheck fails when formula is wrong (regression guard)
 */

import { describe, it, expect } from 'vitest';
import {
  computeMonthRates,
  computeProjectResult,
  selfCheck,
  MonthInput,
} from '@/lib/calculations';

// ---- Fixtures --------------------------------------------------------------

function makeEmp(
  id: string,
  name: string,
  salary: number | null,
  totalH: number,
  billableH: number,
) {
  return {
    employee_no: id,
    employee_name: name,
    salary,
    total_hours: totalH,
    billable_hours: billableH,
    non_billable_hours: totalH - billableH,
  };
}

// ===========================================================================
// computeMonthRates
// ===========================================================================

describe('computeMonthRates', () => {

  it('basic: direct_rate = salary / total_hours', () => {
    const input: MonthInput = {
      year: 2025, month_num: 1, overhead: 0,
      employees: [
        makeEmp('E1', 'Alice', 18000, 180, 140),
      ],
    };
    const result = computeMonthRates(input);
    const alice = result.rates.find(r => r.employee_no === 'E1')!;
    expect(alice.direct_rate).toBeCloseTo(18000 / 180, 8);
  });

  it('indirect_rate = indirect_pool / billable_hours (overhead=0)', () => {
    // Alice: 180h total, 140 billable, 40 non-billable, salary 18000
    // Bob: 0 hours (support staff), salary 12000
    const input: MonthInput = {
      year: 2025, month_num: 1, overhead: 0,
      employees: [
        makeEmp('E1', 'Alice', 18000, 180, 140),
        makeEmp('E2', 'Bob',   12000,   0,   0),
      ],
    };
    const result = computeMonthRates(input);
    const aliceRate = 18000 / 180;
    const expectedPool = 12000 + 40 * aliceRate; // Bob salary + Alice non-billable × rate
    const expectedIndirect = expectedPool / 140;  // ÷ billable hours
    expect(result.indirect_cost_pool).toBeCloseTo(expectedPool, 6);
    expect(result.indirect_cost_rate).toBeCloseTo(expectedIndirect, 6);
  });

  it('zero billable hours → indirect_rate = null, no NaN', () => {
    const input: MonthInput = {
      year: 2025, month_num: 2, overhead: 0,
      employees: [
        makeEmp('E1', 'Alice', 18000, 180, 0), // all non-billable
      ],
    };
    const result = computeMonthRates(input);
    expect(result.indirect_cost_rate).toBeNull();
    expect(result.warnings.some(w => w.includes('indirect cost rate is undefined'))).toBe(true);
  });

  it('zero total hours → direct_rate = null, no NaN', () => {
    const input: MonthInput = {
      year: 2025, month_num: 3, overhead: 0,
      employees: [
        makeEmp('E1', 'Alice', 18000, 0, 0),
      ],
    };
    const result = computeMonthRates(input);
    const alice = result.rates.find(r => r.employee_no === 'E1')!;
    expect(alice.direct_rate).toBeNull();
  });

  it('employee with hours but no salary → warns', () => {
    const input: MonthInput = {
      year: 2025, month_num: 4, overhead: 0,
      employees: [
        makeEmp('E1', 'Ghost', null, 80, 60),
      ],
    };
    const result = computeMonthRates(input);
    expect(result.warnings.some(w => w.includes('Ghost'))).toBe(true);
  });

  it('overhead is added to indirect pool', () => {
    const input: MonthInput = {
      year: 2025, month_num: 1, overhead: 5000,
      employees: [
        makeEmp('E1', 'Alice', 18000, 180, 180), // all billable
      ],
    };
    const result = computeMonthRates(input);
    // Pool = 5000 overhead + 0 non-billable = 5000
    expect(result.indirect_cost_pool).toBeCloseTo(5000, 6);
    expect(result.indirect_cost_rate).toBeCloseTo(5000 / 180, 6);
  });
});

// ===========================================================================
// selfCheck — the critical invariant
// ===========================================================================

describe('selfCheck', () => {

  it('INVARIANT: overhead=0 → total cost = total salaries to the dirham', () => {
    // Two employees, two months
    const inputs: MonthInput[] = [
      {
        year: 2025, month_num: 1, overhead: 0,
        employees: [
          makeEmp('E1', 'Alice', 18000, 180, 140),
          makeEmp('E2', 'Bob',   12000,  80,  60),
        ],
      },
      {
        year: 2025, month_num: 2, overhead: 0,
        employees: [
          makeEmp('E1', 'Alice', 18000, 160, 120),
          makeEmp('E2', 'Bob',   12000,  90,  70),
        ],
      },
    ];
    const results = inputs.map(computeMonthRates);
    const check = selfCheck(inputs, results);

    expect(check.passed).toBe(true);
    expect(check.difference).toBeLessThan(0.01); // within 1 fils

    const expectedSalaries = (18000 + 12000) * 2;
    expect(check.total_salaries).toBe(expectedSalaries);
    expect(check.total_cost).toBeCloseTo(expectedSalaries, 2);
  });

  it('INVARIANT holds even with support staff (zero hours)', () => {
    const inputs: MonthInput[] = [{
      year: 2025, month_num: 3, overhead: 0,
      employees: [
        makeEmp('E1', 'Alice', 18000, 180, 140),  // billable
        makeEmp('E2', 'Bob',   12000,   0,   0),  // support staff
      ],
    }];
    const results = inputs.map(computeMonthRates);
    const check = selfCheck(inputs, results);
    expect(check.passed).toBe(true);
    expect(check.difference).toBeLessThan(0.01);
    expect(check.total_salaries).toBe(30000);
  });

  it('selfCheck fails when we inject wrong formula (regression test)', () => {
    // Simulate a buggy result where indirect pool is doubled
    const inputs: MonthInput[] = [{
      year: 2025, month_num: 1, overhead: 0,
      employees: [makeEmp('E1', 'Alice', 18000, 180, 140)],
    }];
    const results = inputs.map(computeMonthRates);
    // Corrupt the indirect rate to simulate a bug
    const corrupt = [{ ...results[0], indirect_cost_rate: (results[0].indirect_cost_rate ?? 0) * 2 }];
    const check = selfCheck(inputs, corrupt);
    // Cost will not match salaries now
    expect(check.passed).toBe(false);
  });

  it('per-month check: each month passes individually', () => {
    const inputs: MonthInput[] = [
      { year: 2025, month_num: 1, overhead: 0, employees: [makeEmp('E1', 'Alice', 20000, 200, 160)] },
      { year: 2025, month_num: 2, overhead: 0, employees: [makeEmp('E1', 'Alice', 20000, 180, 150)] },
    ];
    const results = inputs.map(computeMonthRates);
    const check = selfCheck(inputs, results);
    expect(check.per_month).toHaveLength(2);
    expect(check.per_month.every(m => m.ok)).toBe(true);
  });
});

// ===========================================================================
// computeProjectResult
// ===========================================================================

describe('computeProjectResult', () => {

  it('basic project profitability', () => {
    // 2 employees, each 50h, price = 100000
    // direct rates 100/h, indirect 20/h
    const rows = [
      { employee_no: 'E1', employee_name: 'Alice', hours: 50, direct_rate: 100, indirect_rate: 20 },
      { employee_no: 'E2', employee_name: 'Bob',   hours: 50, direct_rate:  80, indirect_rate: 20 },
    ];
    const result = computeProjectResult('Q001', 100000, rows);

    // Total cost = 50*(100+20) + 50*(80+20) = 6000 + 5000 = 11000
    expect(result.total_cost).toBeCloseTo(11000, 2);

    // Project profit = (100000 - 11000) / 100000 = 0.89
    expect(result.profitability).toBeCloseTo(0.89, 2);
  });

  it('revenue share: sums to project price', () => {
    const rows = [
      { employee_no: 'E1', employee_name: 'Alice', hours: 60, direct_rate: 100, indirect_rate: 20 },
      { employee_no: 'E2', employee_name: 'Bob',   hours: 40, direct_rate: 100, indirect_rate: 20 },
    ];
    const result = computeProjectResult('Q001', 100000, rows);
    const totalRevShare = result.employees.reduce((s, e) => s + (e.revenue_share ?? 0), 0);
    expect(totalRevShare).toBeCloseTo(100000, 2);
  });

  it('no price → profitability = null, warning emitted', () => {
    const rows = [
      { employee_no: 'E1', employee_name: 'Alice', hours: 50, direct_rate: 100, indirect_rate: 20 },
    ];
    const result = computeProjectResult('Q001', null, rows);
    expect(result.profitability).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('zero hours → profitability computed on empty project', () => {
    const result = computeProjectResult('Q001', 100000, []);
    expect(result.total_hours).toBe(0);
    // No employees → total cost = 0, profitability = 1
    expect(result.profitability).toBeCloseTo(1, 6);
  });

  it('employee with null rate → cost is null, warns', () => {
    const rows = [
      { employee_no: 'E1', employee_name: 'Alice', hours: 50, direct_rate: null, indirect_rate: 20 },
    ];
    const result = computeProjectResult('Q001', 100000, rows);
    expect(result.total_cost).toBeNull();
    expect(result.profitability).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
