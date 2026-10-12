'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '@/components/Navbar';

type EmployeeProductivity = {
  employee_no: string;
  employee_name: string;
  department: string | null;
  designation: string | null;
  total_hours: number;
  billable_hours: number;
  non_billable_hours: number;
  productivity: number | null;
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function ProductivityPage() {
  const [employees, setEmployees] = useState<EmployeeProductivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number | ''>(2025);
  const [selectedMonth, setSelectedMonth] = useState<number | ''>('');

  const fetchProductivity = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedYear !== '') params.append('year', String(selectedYear));
      if (selectedMonth !== '') params.append('month', String(selectedMonth));

      const res = await fetch(`/api/productivity?${params.toString()}`);
      const json = await res.json();
      if (json.ok) {
        setEmployees(json.employees);
      }
    } catch (err) {
      console.error('Failed to load productivity:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    fetchProductivity();
  }, [fetchProductivity]);

  const totalBillable = employees.reduce((s, e) => s + e.billable_hours, 0);
  const totalHours = employees.reduce((s, e) => s + e.total_hours, 0);
  const overallProductivity = totalHours > 0 ? (totalBillable / totalHours) * 100 : null;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Employee Productivity Ranking</h1>
            <p className="text-sm text-slate-500 mt-1">
              Billable vs non-billable utilization formula: <code>Billable Hours ÷ Total Hours</code>.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value ? Number(e.target.value) : '')}
              className="bg-white border border-slate-300 text-sm rounded-lg px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-2xs"
            >
              <option value="">All Years</option>
              <option value={2025}>2025</option>
            </select>

            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value ? Number(e.target.value) : '')}
              className="bg-white border border-slate-300 text-sm rounded-lg px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-2xs"
            >
              <option value="">Full Year</option>
              {MONTH_NAMES.map((name, idx) => (
                <option key={idx + 1} value={idx + 1}>{name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Agency Overall Stat Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-xs text-slate-500 uppercase font-medium">Agency Overall Productivity</span>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {overallProductivity !== null ? `${overallProductivity.toFixed(1)}%` : '—'}
            </p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-xs text-slate-500 uppercase font-medium">Total Billable Time</span>
            <p className="text-2xl font-bold text-indigo-600 mt-1 font-mono">
              {totalBillable.toFixed(1)} <span className="text-xs font-normal text-slate-500">hrs</span>
            </p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-xs text-slate-500 uppercase font-medium">Total Logged Time</span>
            <p className="text-2xl font-bold text-slate-900 mt-1 font-mono">
              {totalHours.toFixed(1)} <span className="text-xs font-normal text-slate-500">hrs</span>
            </p>
          </div>
        </div>

        {/* Productivity Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className="px-6 py-3.5 text-left font-semibold text-slate-700 uppercase tracking-wider text-xs">
                    Employee & Title
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-left font-semibold text-slate-700 uppercase tracking-wider text-xs">
                    Department
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right font-semibold text-slate-700 uppercase tracking-wider text-xs">
                    Billable Hours
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right font-semibold text-slate-700 uppercase tracking-wider text-xs">
                    Internal / Non-Billable
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right font-semibold text-slate-700 uppercase tracking-wider text-xs">
                    Total Hours
                  </th>
                  <th scope="col" className="px-6 py-3.5 text-right font-semibold text-slate-700 uppercase tracking-wider text-xs w-48">
                    Productivity %
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                      Loading employee productivity...
                    </td>
                  </tr>
                ) : employees.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                      No timesheet records found for this period.
                    </td>
                  </tr>
                ) : (
                  employees.map((emp) => {
                    const prodPct = emp.productivity !== null ? emp.productivity * 100 : null;
                    return (
                      <tr key={emp.employee_no} className="hover:bg-slate-50">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-slate-900">{emp.employee_name}</div>
                          <div className="text-xs text-slate-400">{emp.designation ?? '—'} (ID: {emp.employee_no})</div>
                        </td>
                        <td className="px-4 py-4 text-xs">
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 font-medium text-slate-700">
                            {emp.department ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right font-mono text-indigo-600 font-semibold">
                          {emp.billable_hours.toFixed(1)} hrs
                        </td>
                        <td className="px-4 py-4 text-right font-mono text-slate-500">
                          {emp.non_billable_hours.toFixed(1)} hrs
                        </td>
                        <td className="px-4 py-4 text-right font-mono font-medium text-slate-900">
                          {emp.total_hours.toFixed(1)} hrs
                        </td>
                        <td className="px-6 py-4 text-right">
                          {prodPct !== null ? (
                            <div className="flex items-center justify-end space-x-3">
                              <div className="w-24 bg-slate-200 rounded-full h-2 overflow-hidden hidden sm:block">
                                <div
                                  className={`h-2 rounded-full ${
                                    prodPct >= 70 ? 'bg-emerald-500' : prodPct >= 40 ? 'bg-indigo-500' : 'bg-amber-500'
                                  }`}
                                  style={{ width: `${Math.min(prodPct, 100)}%` }}
                                ></div>
                              </div>
                              <span className={`font-mono font-semibold ${
                                prodPct >= 70 ? 'text-emerald-600' : prodPct >= 40 ? 'text-slate-800' : 'text-amber-600'
                              }`}>
                                {prodPct.toFixed(1)}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
