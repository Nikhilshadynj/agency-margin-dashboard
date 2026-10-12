'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import UploadModal from '@/components/UploadModal';
import Link from 'next/link';

type DashboardData = {
  ok: boolean;
  filter: {
    year?: number;
    month?: number;
  };
  summary: {
    total_hours: number;
    billable_hours: number;
    non_billable_hours: number;
    productivity: number | null;
    total_cost: number;
    total_revenue: number;
    margin: number | null;
  };
  self_check: {
    passed: boolean;
    total_salaries: number;
    total_cost: number;
    difference: number;
    per_month: Array<{
      year: number;
      month_num: number;
      salaries: number;
      cost: number;
      ok: boolean;
    }>;
  };
  gaps: Array<{
    type: string;
    employee_no?: string;
    employee_name?: string;
    ref_code?: string;
  }>;
  warnings: string[];
  available: {
    years: number[];
    months: number[];
  };
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number | ''>(2025);
  const [selectedMonth, setSelectedMonth] = useState<number | ''>('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [overhead, setOverhead] = useState<number>(0);
  const [overheadInput, setOverheadInput] = useState<string>('0');
  const [updatingOverhead, setUpdatingOverhead] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedYear !== '') params.append('year', String(selectedYear));
      if (selectedMonth !== '') params.append('month', String(selectedMonth));

      const res = await fetch(`/api/dashboard?${params.toString()}`);
      const json = await res.json();
      if (json.ok) {
        setData(json);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedMonth]);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config');
      const json = await res.json();
      if (json.ok && json.config?.monthly_overhead !== undefined) {
        const val = parseFloat(json.config.monthly_overhead) || 0;
        setOverhead(val);
        setOverheadInput(String(val));
      }
    } catch (err) {
      console.error('Failed to load config:', err);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleUpdateOverhead = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingOverhead(true);
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'monthly_overhead',
          value: overheadInput,
        }),
      });
      setOverhead(parseFloat(overheadInput) || 0);
      fetchData();
    } catch (err) {
      console.error('Failed to update overhead:', err);
    } finally {
      setUpdatingOverhead(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Top Header & Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Executive Margin Overview</h1>
            <p className="text-sm text-slate-500 mt-1">
              Full agency cost rate absorption and margin reconciliation model.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Year Selector */}
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value ? Number(e.target.value) : '')}
              className="bg-white border border-slate-300 text-slate-700 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 px-3 py-2 shadow-2xs"
            >
              <option value="">All Years</option>
              {data?.available.years?.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            {/* Month Selector */}
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value ? Number(e.target.value) : '')}
              className="bg-white border border-slate-300 text-slate-700 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 px-3 py-2 shadow-2xs"
            >
              <option value="">Full Year</option>
              {MONTH_NAMES.map((name, idx) => (
                <option key={idx + 1} value={idx + 1}>{name}</option>
              ))}
            </select>

            {/* Upload Button */}
            <button
              onClick={() => setUploadOpen(true)}
              className="inline-flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-2xs transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload Spreadsheet
            </button>
          </div>
        </div>

        {/* Data Gaps & Warnings Alert Banner */}
        {data && data.gaps.length > 0 && (
          <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-lg shadow-2xs">
            <div className="flex items-start">
              <div className="shrink-0 text-amber-500">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-amber-800">
                  Data Discrepancies Flagged ({data.gaps.length})
                </h3>
                <div className="mt-1 text-xs text-amber-700 space-y-1">
                  {data.gaps.map((g, i) => (
                    <div key={i}>
                      {g.type === 'hours_no_salary' && (
                        <span>• Employee <strong>{g.employee_name} ({g.employee_no})</strong> logged hours without a salary record.</span>
                      )}
                      {g.type === 'hours_no_price' && (
                        <span>• Billable project ref <strong>{g.ref_code}</strong> has hours logged but no price entered in project-prices.</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* KPI Summary Cards */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 animate-pulse">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-28 bg-slate-200 rounded-xl"></div>
            ))}
          </div>
        ) : data ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Card 1: Total Hours */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Logged Time</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold text-slate-900">
                  {data.summary.total_hours.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </span>
                <span className="text-xs text-slate-400">hours</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Non-billable: {data.summary.non_billable_hours.toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs
              </p>
            </div>

            {/* Card 2: Billable Hours */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Billable Hours</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold text-slate-900">
                  {data.summary.billable_hours.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                  {data.summary.productivity !== null ? `${(data.summary.productivity * 100).toFixed(1)}%` : '—'}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Agency productivity ratio
              </p>
            </div>

            {/* Card 3: Total Cost */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Absorbed Cost</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold text-slate-900">
                  AED {Math.round(data.summary.total_cost).toLocaleString()}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Direct labour + indirect pool
              </p>
            </div>

            {/* Card 4: Total Revenue */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Booked Revenue</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold text-slate-900">
                  AED {data.summary.total_revenue.toLocaleString()}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Active project prices
              </p>
            </div>

            {/* Card 5: Net Margin */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Gross Margin</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className={`text-2xl font-bold ${
                  data.summary.margin !== null && data.summary.margin >= 0.5 ? 'text-emerald-600' : 'text-slate-900'
                }`}>
                  {data.summary.margin !== null ? `${(data.summary.margin * 100).toFixed(1)}%` : '—'}
                </span>
                <span className="text-xs text-slate-400">
                  AED {Math.round(data.summary.total_revenue - data.summary.total_cost).toLocaleString()} profit
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                (Revenue − Cost) ÷ Revenue
              </p>
            </div>
          </div>
        ) : null}

        {/* Audit & Self-Check Panel */}
        {data && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center space-x-3">
                  <h2 className="text-base font-semibold text-slate-900">Cost Model Reconciliation & Audit</h2>
                  {data.self_check.passed ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                      ✓ Reconciled to the Dirham
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
                      ⚠ Variance Detected
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  At zero overhead, total absorbed project cost must equal total payroll salaries across every person and month.
                </p>
              </div>

              {/* Monthly Overhead Input */}
              <form onSubmit={handleUpdateOverhead} className="flex items-center space-x-2">
                <span className="text-xs font-medium text-slate-600">Monthly Overhead (AED):</span>
                <input
                  type="number"
                  min="0"
                  step="500"
                  value={overheadInput}
                  onChange={(e) => setOverheadInput(e.target.value)}
                  className="w-28 text-sm px-2.5 py-1.5 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={updatingOverhead}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-medium rounded-lg disabled:opacity-50"
                >
                  Apply
                </button>
              </form>
            </div>

            <div className="p-6 bg-slate-50/50">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm">
                <div className="p-4 bg-white rounded-lg border border-slate-200">
                  <span className="text-xs text-slate-500 uppercase font-medium">Total Payroll Salaries</span>
                  <p className="text-lg font-bold text-slate-900 mt-1">
                    AED {data.self_check.total_salaries.toLocaleString()}
                  </p>
                  <span className="text-xs text-slate-400">Sum of monthly salary sheets</span>
                </div>
                <div className="p-4 bg-white rounded-lg border border-slate-200">
                  <span className="text-xs text-slate-500 uppercase font-medium">Total Absorbed Project Cost</span>
                  <p className="text-lg font-bold text-slate-900 mt-1">
                    AED {data.self_check.total_cost.toLocaleString()}
                  </p>
                  <span className="text-xs text-slate-400">Σ (Billable hours × [Direct + Indirect])</span>
                </div>
                <div className="p-4 bg-white rounded-lg border border-slate-200">
                  <span className="text-xs text-slate-500 uppercase font-medium">Reconciliation Variance</span>
                  <p className={`text-lg font-bold mt-1 ${
                    data.self_check.difference === 0 ? 'text-emerald-600' : 'text-amber-600'
                  }`}>
                    AED {data.self_check.difference}
                  </p>
                  <span className="text-xs text-slate-400">
                    {data.self_check.difference === 0 ? 'Exact 0.00 AED discrepancy' : 'Includes applied overhead'}
                  </span>
                </div>
              </div>

              {/* Monthly breakdown accordion */}
              <div className="mt-6 border border-slate-200 rounded-lg overflow-hidden bg-white">
                <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider flex justify-between">
                  <span>Month-by-Month Reconciliation Status</span>
                  <span>{data.self_check.per_month.length} months active</span>
                </div>
                <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {data.self_check.per_month.map((m, idx) => (
                    <div key={idx} className="px-4 py-2 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800">
                        {m.year}-{String(m.month_num).padStart(2, '0')} ({MONTH_NAMES[m.month_num - 1]})
                      </span>
                      <div className="flex items-center space-x-6 text-slate-600">
                        <span>Payroll: AED {m.salaries.toLocaleString()}</span>
                        <span>Cost: AED {m.cost.toLocaleString()}</span>
                        <span className={`font-semibold ${m.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {m.ok ? '✓ Match' : '✗ Variance'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quick Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link
            href="/projects"
            className="p-6 bg-white rounded-xl border border-slate-200 hover:border-indigo-500 hover:shadow-md transition-all group"
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                  Project Margins &rarr;
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  11 active client contracts with department hours and per-developer contribution tables.
                </p>
              </div>
            </div>
          </Link>

          <Link
            href="/productivity"
            className="p-6 bg-white rounded-xl border border-slate-200 hover:border-indigo-500 hover:shadow-md transition-all group"
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                  Team Productivity &rarr;
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Billable vs non-billable ratio ranked across all 12 agency staff members.
                </p>
              </div>
            </div>
          </Link>

          <Link
            href="/categories"
            className="p-6 bg-white rounded-xl border border-slate-200 hover:border-indigo-500 hover:shadow-md transition-all group"
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                  Time Allocation &rarr;
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Granular breakdown of billable client hours vs internal overhead (meetings, leaves, etc.).
                </p>
              </div>
            </div>
          </Link>
        </div>
      </main>

      <UploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploadSuccess={() => {
          fetchData();
        }}
      />
    </div>
  );
}
