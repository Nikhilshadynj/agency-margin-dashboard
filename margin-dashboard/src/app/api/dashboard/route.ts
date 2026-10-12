/**
 * GET /api/dashboard?year=2025&month=3
 *
 * Returns a full dashboard payload:
 *  - hours breakdown
 *  - cost, revenue, margin (computed with current config)
 *  - data gaps (missing salaries, missing prices)
 *  - self-check result (always included, tells you if numbers add up)
 *
 * All heavy math lives in calculations.ts (pure functions).
 * This route just fetches data from DB and feeds it in.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTimesheetRows, getSalaryRows, getProjectPrices } from '@/lib/queries';
import { getBillableCategories, getMonthlyOverhead } from '@/lib/db';
import { computeMonthRates, computeProjectResult, selfCheck, MonthInput } from '@/lib/calculations';
import { getDataGaps, getAvailableYears, getAvailableMonths } from '@/lib/queries';


export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const year  = sp.get('year')  ? parseInt(sp.get('year')!)  : undefined;
  const month = sp.get('month') ? parseInt(sp.get('month')!) : undefined;

  const filter = { year, month };
  const billable = getBillableCategories();
  const overhead = getMonthlyOverhead();

  // Pull raw data
  const tsRows   = getTimesheetRows(filter);
  const salRows  = getSalaryRows(filter);
  const projects = getProjectPrices() as import('@/lib/queries').ProjectPriceRow[];
  const gaps     = getDataGaps(filter);

  // Build month inputs for calculation layer
  // Group timesheet rows by (year, month_num)
  const monthKeys = [...new Set(tsRows.map(r => `${r.year}-${r.month_num}`))];

  const monthInputs: MonthInput[] = monthKeys.map(key => {
    const [y, m] = key.split('-').map(Number);
    const monthTs = tsRows.filter(r => r.year === y && r.month_num === m);
    const monthSal = salRows.filter(r => r.year === y && r.month_num === m);

    // Build per-employee data
    const empNos = [...new Set(monthTs.map(r => r.employee_no))];
    // Also include employees with salary but zero hours (support staff)
    const salEmpNos = [...new Set(monthSal.map(r => r.employee_no))];
    const allEmpNos = [...new Set([...empNos, ...salEmpNos])];

    const employees = allEmpNos.map(empNo => {
      const empRows = monthTs.filter(r => r.employee_no === empNo);
      const salRow  = monthSal.find(r => r.employee_no === empNo);
      const totalHours    = empRows.reduce((s, r) => s + r.hours, 0);
      const billableHours = empRows.filter(r => billable.includes(r.category)).reduce((s, r) => s + r.hours, 0);
      return {
        employee_no: empNo,
        employee_name: empRows[0]?.employee_name ?? salRow?.employee_name ?? empNo,
        salary: salRow?.salary ?? null,
        total_hours: totalHours,
        billable_hours: billableHours,
        non_billable_hours: totalHours - billableHours,
      };
    });

    return { year: y, month_num: m, employees, overhead };
  });

  const monthResults = monthInputs.map(input => computeMonthRates(input));

  // Aggregate totals
  const totalHours     = monthResults.reduce((s, r) => s + r.total_hours, 0);
  const billableHours  = monthResults.reduce((s, r) => s + r.total_billable_hours, 0);

  // Total cost = Σ over all months and employees
  let totalCost = 0;
  for (let i = 0; i < monthInputs.length; i++) {
    const input  = monthInputs[i];
    const result = monthResults[i];
    for (const emp of input.employees) {
      const rate = result.rates.find(r => r.employee_no === emp.employee_no);
      const direct   = rate?.direct_rate ?? 0;
      const indirect = result.indirect_cost_rate ?? 0;
      totalCost += emp.billable_hours * (direct + indirect);
    }
  }

  // Total revenue = Σ project prices for projects that have ANY hours in filter period
  const billableRefCodes = [...new Set(
    tsRows.filter(r => billable.includes(r.category) && r.ref_code).map(r => r.ref_code!)
  )];
  const totalRevenue = billableRefCodes.reduce((s, rc) => {
    const p = projects.find(pr => pr.ref_code === rc);
    return s + (p?.price ?? 0);
  }, 0);

  const margin = totalRevenue > 0 ? (totalRevenue - totalCost) / totalRevenue : null;

  // Self-check (only meaningful with overhead=0)
  const check = selfCheck(monthInputs, monthResults);

  // All warnings from month computations
  const allWarnings = monthResults.flatMap(r => r.warnings);

  return NextResponse.json({
    ok: true,
    filter,
    summary: {
      total_hours: totalHours,
      billable_hours: billableHours,
      non_billable_hours: totalHours - billableHours,
      productivity: totalHours > 0 ? billableHours / totalHours : null,
      total_cost: Math.round(totalCost * 100) / 100,
      total_revenue: totalRevenue,
      margin,
    },
    self_check: check,
    gaps,
    warnings: allWarnings,
    available: {
      years: getAvailableYears(),
      months: year ? getAvailableMonths(year) : [],
    },
  });
}
