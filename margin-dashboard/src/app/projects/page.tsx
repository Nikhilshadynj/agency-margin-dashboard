'use client';

import React, { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import Link from 'next/link';

type ProjectSummary = {
  ref_code: string;
  name: string;
  category: string | null;
  status: string | null;
  price: number | null;
  total_hours: number;
  total_cost: number | null;
  profitability: number | null;
  warnings: string[];
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  useEffect(() => {
    async function fetchProjects() {
      try {
        const res = await fetch('/api/projects');
        const json = await res.json();
        if (json.ok) {
          setProjects(json.projects);
        }
      } catch (err) {
        console.error('Failed to load projects:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchProjects();
  }, []);

  const filtered = projects.filter((p) => {
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'in_progress' && p.status?.toLowerCase().includes('progress')) ||
      (statusFilter === 'completed' && p.status?.toLowerCase().includes('completed'));

    const matchesSearch =
      p.ref_code.toLowerCase().includes(search.toLowerCase()) ||
      p.name.toLowerCase().includes(search.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Client Projects & Profitability</h1>
            <p className="text-sm text-slate-500 mt-1">
              Select any project to drill down into department hours, team contributions, and margin math.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="text"
              placeholder="Search code or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-white border border-slate-300 text-sm rounded-lg px-3 py-2 w-56 focus:ring-indigo-500 focus:border-indigo-500 shadow-2xs"
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white border border-slate-300 text-sm rounded-lg px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-2xs"
            >
              <option value="all">All Statuses</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>

        {/* Project Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className="px-6 py-3.5 text-left font-semibold text-slate-700 uppercase tracking-wider text-xs">
                    Ref Code & Project
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-left font-semibold text-slate-700 uppercase tracking-wider text-xs">
                    Category
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-left font-semibold text-slate-700 uppercase tracking-wider text-xs">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right font-semibold text-slate-700 uppercase tracking-wider text-xs">
                    Logged Hours
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right font-semibold text-slate-700 uppercase tracking-wider text-xs">
                    Contract Price
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right font-semibold text-slate-700 uppercase tracking-wider text-xs">
                    Absorbed Cost
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right font-semibold text-slate-700 uppercase tracking-wider text-xs">
                    Net Margin %
                  </th>
                  <th scope="col" className="px-6 py-3.5 text-right font-semibold text-slate-700 uppercase tracking-wider text-xs">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                      Loading projects and computing margins...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                      No projects matching your search criteria.
                    </td>
                  </tr>
                ) : (
                  filtered.map((p) => {
                    const profitMargin = p.profitability !== null ? p.profitability * 100 : null;
                    return (
                      <tr key={p.ref_code} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-slate-900">{p.ref_code}</div>
                          <div className="text-xs text-slate-500 truncate max-w-xs">{p.name}</div>
                        </td>
                        <td className="px-4 py-4 text-slate-600 text-xs">
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 font-medium">
                            {p.category ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              p.status?.toLowerCase().includes('completed')
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}
                          >
                            {p.status ?? 'in progress'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right font-mono text-slate-700">
                          {p.total_hours.toFixed(1)} hrs
                        </td>
                        <td className="px-4 py-4 text-right font-medium text-slate-900 font-mono">
                          {p.price !== null ? `AED ${p.price.toLocaleString()}` : <span className="text-amber-600 font-normal">No Price</span>}
                        </td>
                        <td className="px-4 py-4 text-right font-mono text-slate-700">
                          {p.total_cost !== null ? `AED ${Math.round(p.total_cost).toLocaleString()}` : '—'}
                        </td>
                        <td className="px-4 py-4 text-right font-mono">
                          {profitMargin !== null ? (
                            <span
                              className={`font-semibold ${
                                profitMargin >= 50
                                  ? 'text-emerald-600'
                                  : profitMargin >= 20
                                  ? 'text-slate-800'
                                  : 'text-rose-600'
                              }`}
                            >
                              {profitMargin.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link
                            href={`/projects/${p.ref_code}`}
                            className="inline-flex items-center px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
                          >
                            Breakdown &rarr;
                          </Link>
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
