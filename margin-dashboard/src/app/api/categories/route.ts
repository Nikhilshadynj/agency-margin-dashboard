/**
 * GET /api/categories?year=2025&month=3
 *
 * Returns hours grouped by category, filterable by year and/or month.
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

  const catMap: Record<string, { category: string; hours: number; is_billable: boolean }> = {};
  let total = 0;

  for (const r of rows) {
    if (!catMap[r.category]) {
      catMap[r.category] = {
        category: r.category,
        hours: 0,
        is_billable: billable.includes(r.category),
      };
    }
    catMap[r.category].hours += r.hours;
    total += r.hours;
  }

  const categories = Object.values(catMap)
    .map(c => ({ ...c, pct: total > 0 ? c.hours / total : 0 }))
    .sort((a, b) => b.hours - a.hours);

  return NextResponse.json({ ok: true, total_hours: total, categories });
}
