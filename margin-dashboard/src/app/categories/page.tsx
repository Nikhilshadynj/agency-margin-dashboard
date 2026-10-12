'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '@/components/Navbar';

type CategoryItem = {
  category: string;
  hours: number;
  is_billable: boolean;
  pct: number;
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [totalHours, setTotalHours] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number | ''>(2025);
  const [selectedMonth, setSelectedMonth] = useState<number | ''>('');

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedYear !== '') params.append('year', String(selectedYear));
      if (selectedMonth !== '') params.append('month', String(selectedMonth));

      const res = await fetch(`/api/categories?${params.toString()}`);
      const json = await res.json();
      if (json.ok) {
        setCategories(json.categories);
        setTotalHours(json.total_hours);
      }
    } catch (err) {
      console.error('Failed to load categories:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const billableHours = categories.filter((c) => c.is_billable).reduce((s, c) => s + c.hours, 0);
  const nonBillableHours = totalHours - billableHours;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Time Allocation by Category</h1>
            <p className="text-sm text-slate-500 mt-1">
              Where does the agency&apos;s time actually go? Client deliverables vs internal overhead.
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

        {/* High level billable vs overhead split */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-xs text-slate-500 uppercase font-medium">Total Agency Time</span>
            <p className="text-2xl font-bold text-slate-900 mt-1 font-mono">
              {totalHours.toFixed(1)} <span className="text-xs font-normal text-slate-500">hrs</span>
            </p>
          </div>
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500 uppercase font-medium">Direct Client Work</span>
              <span className="px-2 py-0.5 rounded text-2xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Billable
              </span>
            </div>
            <p className="text-2xl font-bold text-emerald-600 mt-1 font-mono">
              {billableHours.toFixed(1)} <span className="text-xs font-normal text-slate-500">hrs</span>
            </p>
            <span className="text-xs text-slate-400 mt-1 block">
              {totalHours > 0 ? `${((billableHours / totalHours) * 100).toFixed(1)}% of total time` : '—'}
            </span>
          </div>
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500 uppercase font-medium">Internal & Fixed Costs</span>
              <span className="px-2 py-0.5 rounded text-2xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                Overhead Pool
              </span>
            </div>
            <p className="text-2xl font-bold text-slate-700 mt-1 font-mono">
              {nonBillableHours.toFixed(1)} <span className="text-xs font-normal text-slate-500">hrs</span>
            </p>
            <span className="text-xs text-slate-400 mt-1 block">
              {totalHours > 0 ? `${((nonBillableHours / totalHours) * 100).toFixed(1)}% of total time` : '—'}
            </span>
          </div>
        </div>

        {/* Categories Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className="px-6 py-3.5 text-left font-semibold text-slate-700 uppercase tracking-wider text-xs">
                    Category Name
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-left font-semibold text-slate-700 uppercase tracking-wider text-xs">
                    Classification
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right font-semibold text-slate-700 uppercase tracking-wider text-xs">
                    Hours Logged
                  </th>
                  <th scope="col" className="px-6 py-3.5 text-right font-semibold text-slate-700 uppercase tracking-wider text-xs w-64">
                    Share of Total Time
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                      Loading category breakdown...
                    </td>
                  </tr>
                ) : categories.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                      No category records found.
                    </td>
                  </tr>
                ) : (
                  categories.map((cat) => {
                    const pct = cat.pct * 100;
                    return (
                      <tr key={cat.category} className="hover:bg-slate-50">
                        <td className="px-6 py-4 font-semibold text-slate-900">
                          {cat.category}
                        </td>
                        <td className="px-4 py-4 text-xs">
                          {cat.is_billable ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Direct Billable
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600 border border-slate-200">
                              Internal Overhead (FC)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right font-mono font-medium text-slate-900">
                          {cat.hours.toFixed(1)} hrs
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end space-x-3">
                            <div className="w-32 bg-slate-100 rounded-full h-2 overflow-hidden hidden sm:block">
                              <div
                                className={`h-2 rounded-full ${cat.is_billable ? 'bg-indigo-600' : 'bg-slate-400'}`}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              ></div>
                            </div>
                            <span className="font-mono text-xs font-semibold text-slate-700 w-12 text-right">
                              {pct.toFixed(1)}%
                            </span>
                          </div>
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
