"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import Link from "next/link";

type Profile = {
  id: string;
  name: string;
};

type WorkSummaryRow = {
  id: number;
  work: string;
  handled_tasks: number;
};

function getCurrentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getMonthDisplay(monthStr: string) {
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
}

export default function AdminWorkSummaryPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth());
  const [workSummary, setWorkSummary] = useState<WorkSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadEmployees() {
    setErr(null);
    setLoading(true);

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      router.replace("/login");
      return;
    }

    const { data: userProf } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", u.user.id)
      .single();

    if (userProf?.role === "employee") {
      router.replace("/app");
      return;
    }

    const profRes = await supabase
      .from("profiles")
      .select("id,name")
      .eq("role", "employee")
      .order("name", { ascending: true });

    if (profRes.error) {
      setErr(profRes.error.message);
      setLoading(false);
      return;
    }

    setProfiles((profRes.data as any) ?? []);
    setLoading(false);
  }

  async function loadWorkSummary(userId: string, month: string) {
    if (!userId) {
      setWorkSummary([]);
      return;
    }

    setLoadingSummary(true);
    setErr(null);

    const { data, error } = await supabase
      .from("work_summary")
      .select("id,work,handled_tasks")
      .eq("user_id", userId)
      .eq("month", month)
      .order("id", { ascending: true });

    if (error) {
      setErr(error.message);
      setLoadingSummary(false);
      return;
    }

    setWorkSummary((data as any) ?? []);
    setLoadingSummary(false);
  }

  useEffect(() => {
    loadEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedUserId && selectedMonth) {
      loadWorkSummary(selectedUserId, selectedMonth);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId, selectedMonth]);

  const selectedEmployee = profiles.find((p) => p.id === selectedUserId);
  const totalTasks = workSummary.reduce((sum, row) => sum + row.handled_tasks, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="mx-auto max-w-6xl p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">
              Employee Work Summary
            </h1>
            <p className="text-sm text-gray-500">
              View work summary for each employee
            </p>
          </div>

          <Link
            className="text-sm font-medium hover:underline flex items-center gap-1"
            href="/admin"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Admin Home
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="grid gap-4 sm:grid-cols-2 mb-6">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Select Employee
              </label>
              <select
                className="w-full rounded-xl border border-gray-300 p-3 focus:ring-2 focus:ring-black focus:border-transparent transition-all outline-none"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
              >
                <option value="">-- Choose an employee --</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Select Month
              </label>
              <input
                type="month"
                className="w-full rounded-xl border border-gray-300 p-3 focus:ring-2 focus:ring-black focus:border-transparent transition-all outline-none"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              />
            </div>
          </div>

          {err && (
            <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg mb-4">
              {err}
            </p>
          )}

          {loading && <p className="text-gray-500">Loading employees...</p>}

          {!loading && (!selectedUserId || !selectedMonth) && (
            <p className="text-gray-400 text-center py-8">
              Please select an employee and month to view work summary
            </p>
          )}

          {selectedUserId && selectedMonth && (
            <>
              <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Work summary for</div>
                    <div className="text-xl font-bold text-gray-900">
                      {selectedEmployee?.name}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {getMonthDisplay(selectedMonth)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-600 mb-1">Total Tasks Handled</div>
                    <div className="text-3xl font-bold text-blue-600">
                      {totalTasks}
                    </div>
                  </div>
                </div>
              </div>

              {loadingSummary && (
                <p className="text-gray-500 text-center py-8">Loading work summary...</p>
              )}

              {!loadingSummary && workSummary.length === 0 && (
                <p className="text-gray-400 text-center py-8">
                  No work summary records for {getMonthDisplay(selectedMonth)}
                </p>
              )}

              {!loadingSummary && workSummary.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="p-4 text-left font-semibold text-gray-700 w-16">
                          No
                        </th>
                        <th className="p-4 text-left font-semibold text-gray-700">
                          Work
                        </th>
                        <th className="p-4 text-left font-semibold text-gray-700 w-48">
                          Handled Tasks
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {workSummary.map((r, index) => (
                        <tr
                          key={r.id}
                          className="hover:bg-gray-50 transition-colors"
                        >
                          <td className="p-4 text-gray-600">{index + 1}</td>
                          <td className="p-4 font-medium text-gray-900">
                            {r.work}
                          </td>
                          <td className="p-4">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-blue-50 text-blue-700">
                              {r.handled_tasks}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
