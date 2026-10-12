/**
 * GET  /api/config          → returns all config values
 * POST /api/config          → body: { key, value }; updates a config value
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb, getConfig, setConfig } from '@/lib/db';


export async function GET() {
  const db = getDb();
  const all = db.prepare('SELECT key, value FROM config').all() as { key: string; value: string }[];
  const result: Record<string, string> = {};
  for (const { key, value } of all) result[key] = value;
  return NextResponse.json({ ok: true, config: result });
}

export async function POST(req: NextRequest) {
  let body: { key?: string; value?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { key, value } = body;
  if (!key || value === undefined) {
    return NextResponse.json({ ok: false, error: 'key and value are required.' }, { status: 400 });
  }

  const ALLOWED = ['monthly_overhead', 'billable_categories'];
  if (!ALLOWED.includes(key)) {
    return NextResponse.json({ ok: false, error: `Unknown config key: ${key}` }, { status: 400 });
  }

  setConfig(key, value);
  return NextResponse.json({ ok: true, key, value });
}
