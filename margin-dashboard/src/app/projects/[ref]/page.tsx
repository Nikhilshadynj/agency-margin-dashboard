'use client';

import Navbar from '@/components/Navbar';
import Link from 'next/link';

type ProjectDetail = {
  ok: boolean;
  project: {
    ref_code: string;
    name: string;
    price: number | null;
    sales_month: string | null;
    category: string | null;
    status: string | null;
  };
  total_hours: number;
  total_cost: number | null;
  profitability: number | null;
  dept_hours: Array<{ dept: string; hours: number }>;
  employees: Array<{
    employee_no: string;
    employee_name: string;
    hours: number;
    direct_rate: number | null;
    indirect_rate: number | null;
    cost: number | null;
    revenue_share: number | null;
    profitability: number | null;
  }>;
  warnings: string[];
};

import React, { useState, useEffect, Suspense, use } from 'react';

type PageProps = {
  params: Promise<{ ref: string }>;
};

export default function ProjectDetailPage({ params }: PageProps) {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading project...</div>}>
      <ProjectDetailContent paramsPromise={params} />
    </Suspense>
  );
}

function ProjectDetailContent({ paramsPromise }: { paramsPromise: Promise<{ ref: string }> }) {
  const resolvedParams = use(paramsPromise);
  const refCode = resolvedParams.ref;

  const [data, setData] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!refCode) return;
    async function fetchDetail() {
      try {
        const res = await fetch(`/api/projects?ref=${encodeURIComponent(refCode)}`);
        const json = await res.json();
        if (json.ok) {
          setData(json);
        }
      } catch (err) {
        console.error('Failed to load project detail:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchDetail();
  }, [refCode]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-12 text-center text-slate-500">
          Loading project financial model...
        </main>
      </div>
    );
  }

  if (!data || !data.project) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-12 text-center">
          <h2 className="text-xl font-bold text-slate-900">Project Not Found</h2>
          <p className="text-sm text-slate-500 mt-2">Could not find project ref: {refCode}</p>
          <Link href="/projects" className="mt-4 inline-block text-indigo-600 font-medium">
            &larr; Back to Projects
          </Link>
        </main>
      </div>
    );
  }

  const p = data.project;
  const marginPct = data.profitability !== null ? data.profitability * 100 : null;
  const netProfit = p.price !== null && data.total_cost !== null ? p.price - data.total_cost : null;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Breadcrumb & Navigation */}
        <div className="flex items-center space-x-2 text-sm text-slate-500">
          <Link href="/projects" className="hover:text-slate-800 transition-colors">
            &larr; All Projects
          </Link>
          <span>/</span>
          <span className="font-semibold text-slate-900">{p.ref_code}</span>
        </div>

        {/* Project Header Card */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-3">
                <h1 className="text-2xl font-bold text-slate-900">{p.ref_code}</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                  {p.category ?? 'Projects'}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  p.status?.toLowerCase().includes('completed')
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-blue-50 text-blue-700 border border-blue-200'
                }`}>
                  {p.status ?? 'in progress'}
                </span>
              </div>
              <p className="text-sm text-slate-600 mt-1">{p.name}</p>
              {p.sales_month && (
                <p className="text-xs text-slate-400 mt-1">Booked in: {p.sales_month}</p>
              )}
            </div>

            <div className="flex items-center space-x-6 text-right">
              <div>
                <span className="text-xs text-slate-500 uppercase font-medium">Contract Price</span>
                <p className="text-xl font-bold text-slate-900 mt-0.5">
                  {p.price !== null ? `AED ${p.price.toLocaleString()}` : 'Unpriced'}
                </p>
              </div>
              <div>
                <span className="text-xs text-slate-500 uppercase font-medium">Net Profit</span>
                <p className={`text-xl font-bold mt-0.5 ${
                  netProfit !== null && netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}>
                  {netProfit !== null ? `AED ${Math.round(netProfit).toLocaleString()}` : '—'}
                </p>
              </div>
              <div>
                <span className="text-xs text-slate-500 uppercase font-medium">Project Margin</span>
                <p className={`text-xl font-bold mt-0.5 ${
                  marginPct !== null && marginPct >= 50 ? 'text-emerald-600' : 'text-slate-900'
                }`}>
                  {marginPct !== null ? `${marginPct.toFixed(1)}%` : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Warning if any */}
        {data.warnings.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg text-xs text-amber-800">
            <span className="font-semibold">Notes & Warnings:</span>
            <ul className="list-disc pl-4 mt-1 space-y-0.5">
              {data.warnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Department Hours Breakdown */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Hours by Department</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {data.dept_hours.map((dh) => {
              const pct = data.total_hours > 0 ? (dh.hours / data.total_hours) * 100 : 0;
              return (
                <div key={dh.dept} className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-xs font-semibold text-slate-500 uppercase">{dh.dept}</span>
                  <p className="text-lg font-bold text-slate-900 mt-1 font-mono">
                    {dh.hours.toFixed(1)} <span className="text-xs font-normal text-slate-500">hrs</span>
                  </p>
                  <div className="mt-2 w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${pct}%` }}></div>
                  </div>
                  <span className="text-2xs text-slate-400 mt-1 block">{pct.toFixed(1)}% of project</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Per-Employee Contribution Table (PDF Formula) */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
          <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Per-Employee Contribution & Profitability</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Calculated strictly via PDF formulas: Revenue Share = Price × (Emp Hours ÷ Project Hours); Cost = Hours × (Direct + Indirect Rates).
              </p>
            </div>
            <span className="text-xs font-medium text-slate-500">
              Total Logged: {data.total_hours.toFixed(1)} hours
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left font-semibold text-slate-700 uppercase tracking-wider text-xs">
                    Team Member
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-700 uppercase tracking-wider text-xs">
                    Hours on Proj
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-700 uppercase tracking-wider text-xs">
                    Direct Rate
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-700 uppercase tracking-wider text-xs">
                    Indirect Rate
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-700 uppercase tracking-wider text-xs">
                    Absorbed Cost
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-700 uppercase tracking-wider text-xs">
                    Revenue Share
                  </th>
                  <th scope="col" className="px-6 py-3 text-right font-semibold text-slate-700 uppercase tracking-wider text-xs">
                    Profitability %
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white font-mono text-xs">
                {data.employees.map((emp) => {
                  const empProf = emp.profitability !== null ? emp.profitability * 100 : null;
                  return (
                    <tr key={emp.employee_no} className="hover:bg-slate-50">
                      <td className="px-6 py-3.5 font-sans">
                        <div className="font-semibold text-slate-900">{emp.employee_name}</div>
                        <div className="text-2xs text-slate-400">ID: {emp.employee_no}</div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold text-slate-800">
                        {emp.hours.toFixed(1)} hrs
                      </td>
                      <td className="px-4 py-3.5 text-right text-slate-600">
                        {emp.direct_rate !== null ? `AED ${emp.direct_rate.toFixed(2)}/h` : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-right text-slate-600">
                        {emp.indirect_rate !== null ? `AED ${emp.indirect_rate.toFixed(2)}/h` : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-right font-medium text-slate-900">
                        {emp.cost !== null ? `AED ${Math.round(emp.cost).toLocaleString()}` : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-right font-medium text-slate-900">
                        {emp.revenue_share !== null ? `AED ${Math.round(emp.revenue_share).toLocaleString()}` : '—'}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        {empProf !== null ? (
                          <span className={`font-semibold ${
                            empProf >= 50 ? 'text-emerald-600' : empProf >= 20 ? 'text-slate-800' : 'text-rose-600'
                          }`}>
                            {empProf.toFixed(1)}%
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 font-mono text-xs font-semibold text-slate-900">
                <tr>
                  <td className="px-6 py-3 font-sans">Project Total</td>
                  <td className="px-4 py-3 text-right">{data.total_hours.toFixed(1)} hrs</td>
                  <td className="px-4 py-3 text-right" colSpan={2}>—</td>
                  <td className="px-4 py-3 text-right">
                    {data.total_cost !== null ? `AED ${Math.round(data.total_cost).toLocaleString()}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p.price !== null ? `AED ${p.price.toLocaleString()}` : '—'}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {marginPct !== null ? `${marginPct.toFixed(1)}%` : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
