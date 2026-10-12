/**
 * GET /api/projects           → list of all projects with summary
 * GET /api/projects?ref=XXX   → single project full detail
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTimesheetRows, getSalaryRows, getProjectPrices } from '@/lib/queries';
import { getBillableCategories, getMonthlyOverhead } from '@/lib/db';
import { computeMonthRates, computeProjectResult } from '@/lib/calculations';


export async function GET(req: NextRequest) {
  const sp  = req.nextUrl.searchParams;
  const ref = sp.get('ref');
  const year  = sp.get('year')  ? parseInt(sp.get('year')!)  : undefined;
  const month = sp.get('month') ? parseInt(sp.get('month')!) : undefined;

  const billable = getBillableCategories();
  const overhead = getMonthlyOverhead();

  if (ref) {
    // ---- Single project detail ----
    const priceRow = getProjectPrices(ref) as import('@/lib/queries').ProjectPriceRow | undefined;
    const tsRows   = getTimesheetRows({ year, month }).filter(
      r => r.ref_code === ref && billable.includes(r.category)
    );

    if (!priceRow && tsRows.length === 0) {
      return NextResponse.json({ ok: false, error: `Project ${ref} not found.` }, { status: 404 });
    }

    // Build month rates (we need indirect rate per month)
    const allTs  = getTimesheetRows({ year, month });
    const allSal = getSalaryRows({ year, month });

    const monthKeys = [...new Set(tsRows.map(r => `${r.year}-${r.month_num}`))];
    const monthRatesMap: Record<string, ReturnType<typeof computeMonthRates>> = {};

    for (const key of monthKeys) {
      const [y, m] = key.split('-').map(Number);
      const monthTs  = allTs.filter(r => r.year === y && r.month_num === m);
      const monthSal = allSal.filter(r => r.year === y && r.month_num === m);

      const empNos = [...new Set([...monthTs.map(r => r.employee_no), ...monthSal.map(r => r.employee_no)])];
      const employees = empNos.map(empNo => {
        const empRows = monthTs.filter(r => r.employee_no === empNo);
        const salRow  = monthSal.find(r => r.employee_no === empNo);
        const totalH    = empRows.reduce((s, r) => s + r.hours, 0);
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
      monthRatesMap[key] = computeMonthRates({ year: y, month_num: m, employees, overhead });
    }

    // Build rows for project computation (one per employee-month slice)
    const projRows = tsRows.map(r => {
      const key    = `${r.year}-${r.month_num}`;
      const mr     = monthRatesMap[key];
      const empRate = mr?.rates.find(er => er.employee_no === r.employee_no);
      return {
        employee_no: r.employee_no,
        employee_name: r.employee_name,
        hours: r.hours,
        direct_rate: empRate?.direct_rate ?? null,
        indirect_rate: mr?.indirect_cost_rate ?? null,
      };
    });

    // Department hours breakdown
    const deptHours: Record<string, number> = {};
    for (const r of tsRows) {
      const dept = r.department ?? 'Unknown';
      deptHours[dept] = (deptHours[dept] ?? 0) + r.hours;
    }

    const projectResult = computeProjectResult(
      ref,
      priceRow?.price ?? null,
      projRows,
    );

    return NextResponse.json({
      ok: true,
      project: {
        ref_code: ref,
        name: priceRow?.name ?? ref,
        price: priceRow?.price ?? null,
        sales_month: priceRow?.sales_month ?? null,
        category: priceRow?.category ?? null,
        status: priceRow?.status ?? null,
      },
      dept_hours: Object.entries(deptHours).map(([dept, hours]) => ({ dept, hours })),
      ...projectResult,
    });
  }

  // ---- Project list ----
  const prices = getProjectPrices() as import('@/lib/queries').ProjectPriceRow[];
  const allTs  = getTimesheetRows({ year, month });
  const allSal = getSalaryRows({ year, month });

  // Build month rates for the filtered period
  const monthKeys = [...new Set(allTs.map(r => `${r.year}-${r.month_num}`))];
  const monthRatesMap: Record<string, ReturnType<typeof computeMonthRates>> = {};

  for (const key of monthKeys) {
    const [y, m] = key.split('-').map(Number);
    const monthTs  = allTs.filter(r => r.year === y && r.month_num === m);
    const monthSal = allSal.filter(r => r.year === y && r.month_num === m);
    const empNos = [...new Set([...monthTs.map(r => r.employee_no), ...monthSal.map(r => r.employee_no)])];
    const employees = empNos.map(empNo => {
      const empRows = monthTs.filter(r => r.employee_no === empNo);
      const salRow  = monthSal.find(r => r.employee_no === empNo);
      const totalH    = empRows.reduce((s, r) => s + r.hours, 0);
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
    monthRatesMap[key] = computeMonthRates({ year: y, month_num: m, employees, overhead });
  }

  const projectList = prices.map(p => {
    const pTs = allTs.filter(r => r.ref_code === p.ref_code && billable.includes(r.category));
    const projRows = pTs.map(r => {
      const key = `${r.year}-${r.month_num}`;
      const mr  = monthRatesMap[key];
      const er  = mr?.rates.find(er => er.employee_no === r.employee_no);
      return {
        employee_no: r.employee_no,
        employee_name: r.employee_name,
        hours: r.hours,
        direct_rate: er?.direct_rate ?? null,
        indirect_rate: mr?.indirect_cost_rate ?? null,
      };
    });
    const result = computeProjectResult(p.ref_code, p.price, projRows);
    return {
      ref_code: p.ref_code,
      name: p.name,
      category: p.category,
      status: p.status,
      price: p.price,
      total_hours: result.total_hours,
      total_cost: result.total_cost,
      profitability: result.profitability,
      warnings: result.warnings,
    };
  });

  return NextResponse.json({ ok: true, projects: projectList });
}
