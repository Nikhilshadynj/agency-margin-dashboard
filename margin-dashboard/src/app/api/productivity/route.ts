/**
 * GET /api/productivity?year=2025&month=3
 *
 * Returns per-employee productivity (billable ÷ total hours)
 * filterable by year and/or month.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTimesheetRows } from '@/lib/queries';
import { getBillableCategories } from '@/lib/db';


export async function GET(req: NextRequest) {
  const sp    = req.nextUrl.searchParams;
  const year  = sp.get('year')  ? parseInt(sp.get('year')!)  : undefined;
  const month = sp.get('month') ? parseInt(sp.get('month')!) : undefined;

  const billable = getBillableCategories();
  const rows     = getTimesheetRows({ year, month });

  // Aggregate per employee
  const empMap: Record<string, {
    employee_no: string;
    employee_name: string;
    department: string | null;
    designation: string | null;
    total_hours: number;
    billable_hours: number;
  }> = {};

  for (const r of rows) {
    if (!empMap[r.employee_no]) {
      empMap[r.employee_no] = {
        employee_no: r.employee_no,
        employee_name: r.employee_name,
        department: r.department,
        designation: r.designation,
        total_hours: 0,
        billable_hours: 0,
      };
    }
    empMap[r.employee_no].total_hours    += r.hours;
    if (billable.includes(r.category)) {
      empMap[r.employee_no].billable_hours += r.hours;
    }
  }

  const employees = Object.values(empMap).map(e => ({
    ...e,
    non_billable_hours: e.total_hours - e.billable_hours,
    productivity: e.total_hours > 0 ? e.billable_hours / e.total_hours : null,
  })).sort((a, b) => (b.productivity ?? -1) - (a.productivity ?? -1));

  return NextResponse.json({ ok: true, employees });
}
