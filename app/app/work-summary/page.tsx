"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import LogoutButton from "@/app/components/LogoutButton";
import Link from "next/link";

type WorkSummaryRow = {
  id: number;
  work: string;
  handled_tasks: number;
};

const DEFAULT_WORK_TYPES = [
  'Computer Repair',
  'Computer Upgrade',
  'New Computer installation',
  'Head office user Support',
  'POS Configuration',
  'Mobile Device configuration',
  'Scan and Go',
  'Tabs ( HC )',
  'Tabs ( HRP )',
  'Tabs ( Backey Tab )',
  'Other users Support',
];

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

export default function WorkSummaryPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();
  const currentMonth = getCurrentMonth();
  const [rows, setRows] = useState<WorkSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<number>(0);
  const [newWork, setNewWork] = useState("");
  const [addingNew, setAddingNew] = useState(false);

  async function ensureDefaultWorkTypes(userId: string) {
    // Check if user has work types for current month
    const { data: existing } = await supabase
      .from("work_summary")
      .select("work")
      .eq("user_id", userId)
      .eq("month", currentMonth);

    if (existing && existing.length > 0) {
      return; // Already has records for this month
    }

    // Create default work types for current month
    const defaultRecords = DEFAULT_WORK_TYPES.map(work => ({
      user_id: userId,
      work,
      handled_tasks: 0,
      month: currentMonth,
    }));

    await supabase.from("work_summary").insert(defaultRecords);
  }

  async function load() {
    setErr(null);
    setLoading(true);

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      router.replace("/login");
      return;
    }

    const { data: prof } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", u.user.id)
      .single();

    if (prof?.role === "admin") {
      router.replace("/admin");
      return;
    }

    // Ensure default work types exist for current month
    await ensureDefaultWorkTypes(u.user.id);

    // Load work summary for current month only
    const { data, error } = await supabase
      .from("work_summary")
      .select("id,work,handled_tasks")
      .eq("user_id", u.user.id)
      .eq("month", currentMonth)
      .order("id", { ascending: true });

    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    setRows((data as any) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function updateHandledTasks(id: number, newValue: number) {
    if (newValue < 0) {
      setErr("Handled tasks cannot be negative");
      return;
    }

    const { error } = await supabase
      .from("work_summary")
      .update({ handled_tasks: newValue, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      setErr(error.message);
      return;
    }

    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, handled_tasks: newValue } : r))
    );
    setEditingId(null);
    setMsg("Updated successfully ✅");
    setTimeout(() => setMsg(null), 3000);
  }

  async function addNewRow() {
    if (!newWork.trim()) {
      setErr("Work description cannot be empty");
      return;
    }

    setAddingNew(true);
    setErr(null);

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setErr("Not logged in");
      setAddingNew(false);
      return;
    }

    const { data, error } = await supabase
      .from("work_summary")
      .insert({
        user_id: u.user.id,
        work: newWork.trim(),
        handled_tasks: 0,
        month: currentMonth,
      })
      .select()
      .single();

    if (error) {
      setErr(error.message);
      setAddingNew(false);
      return;
    }

    setRows((prev) => [...prev, data as any]);
    setNewWork("");
    setAddingNew(false);
    setMsg("New work type added ✅");
    setTimeout(() => setMsg(null), 3000);
  }

  async function deleteRow(id: number) {
    if (!confirm("Are you sure you want to delete this row?")) {
      return;
    }

    const { error } = await supabase.from("work_summary").delete().eq("id", id);

    if (error) {
      setErr(error.message);
      return;
    }

    setRows((prev) => prev.filter((r) => r.id !== id));
    setMsg("Deleted successfully ✅");
    setTimeout(() => setMsg(null), 3000);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="mx-auto max-w-5xl p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2 text-gray-900">
              Work Summary
            </h1>
            <p className="text-sm text-gray-600">
              Track your handled tasks for {getMonthDisplay(currentMonth)}
            </p>
          </div>
          <LogoutButton />
        </div>

        <Link
          className="text-sm font-medium text-gray-900 hover:underline flex items-center gap-1"
          href="/app"
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
          Back to Attendance
        </Link>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          {err && (
            <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg mb-4">
              {err}
            </p>
          )}
          {msg && (
            <p className="text-sm text-green-700 bg-green-50 p-3 rounded-lg mb-4">
              {msg}
            </p>
          )}
          {loading && <p className="text-gray-500">Loading...</p>}

          {!loading && (
            <>
              <div className="overflow-x-auto rounded-xl border border-gray-200 mb-4">
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
                      <th className="p-4 text-left font-semibold text-gray-700 w-32">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {rows.map((r, index) => (
                      <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                        <td className="p-4 text-gray-600">{index + 1}</td>
                        <td className="p-4 font-medium text-gray-900">{r.work}</td>
                        <td className="p-4">
                          {editingId === r.id ? (
                            <div className="flex gap-2 items-center">
                              <input
                                type="number"
                                min="0"
                                className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-black focus:border-transparent outline-none"
                                value={editValue}
                                onChange={(e) =>
                                  setEditValue(parseInt(e.target.value) || 0)
                                }
                                autoFocus
                              />
                              <button
                                onClick={() =>
                                  updateHandledTasks(r.id, editValue)
                                }
                                className="text-green-600 hover:text-green-700 font-medium text-xs"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="text-gray-600 hover:text-gray-700 font-medium text-xs"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-2 items-center">
                              <span className="font-semibold text-gray-900">
                                {r.handled_tasks}
                              </span>
                              <button
                                onClick={() => {
                                  setEditingId(r.id);
                                  setEditValue(r.handled_tasks);
                                }}
                                className="text-blue-600 hover:text-blue-700 text-xs font-medium"
                              >
                                Edit
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="p-4">
                          <button
                            onClick={() => deleteRow(r.id)}
                            className="text-red-600 hover:text-red-700 text-sm font-medium"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}

                    {rows.length === 0 && (
                      <tr>
                        <td
                          className="p-4 text-center text-gray-400"
                          colSpan={4}
                        >
                          No work summary records yet. Add one below!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Add New Row Form */}
              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  Add New Work Type
                </h3>
                <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder="e.g., Computer Repair, POS Configuration..."
                    value={newWork}
                    onChange={(e) => setNewWork(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-black focus:border-transparent outline-none"
                    onKeyPress={(e) => {
                      if (e.key === "Enter" && !addingNew) {
                        addNewRow();
                      }
                    }}
                  />
                  <button
                    onClick={addNewRow}
                    disabled={addingNew}
                    className="rounded-lg bg-black text-white px-6 py-2 font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {addingNew ? "Adding..." : "Add Row"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
