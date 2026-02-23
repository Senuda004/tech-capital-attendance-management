"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import Link from "next/link";

type LeaveRow = {
  id: number;
  user_id: string;
  from_date: string;
  to_date: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  leave_type: "sick" | "casual";
  is_half_day: boolean;
  half_day_period: "morning" | "evening" | null;
  created_at: string;
  profiles?: { name: string | null } | null;
};

export default function AdminLeavesPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    setLoading(true);

    // Check role first
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

    const { data, error } = await supabase
      .from("leave_requests")
      .select("id,user_id,from_date,to_date,reason,status,leave_type,is_half_day,half_day_period,created_at,profiles(name)")
      .order("created_at", { ascending: false });

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

  async function setStatus(id: number, status: "approved" | "rejected") {
    // If rejecting, restore the leave balance
    if (status === "rejected") {
      const leaveRequest = rows.find((r) => r.id === id);
      if (leaveRequest) {
        const daysDiff = leaveRequest.is_half_day 
          ? 0.5 
          : Math.ceil((new Date(leaveRequest.to_date).getTime() - new Date(leaveRequest.from_date).getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const balanceColumn = leaveRequest.leave_type === "sick" ? "sick_leave_balance" : "casual_leave_balance";
        
        // Get current balance
        const { data: profile } = await supabase
          .from("profiles")
          .select(balanceColumn)
          .eq("id", leaveRequest.user_id)
          .single();
        
        if (profile) {
          const currentBalance = (profile as any)[balanceColumn] ?? 0;
          const newBalance = currentBalance + daysDiff;
          
          // Restore balance
          await supabase
            .from("profiles")
            .update({ [balanceColumn]: newBalance })
            .eq("id", leaveRequest.user_id);
        }
      }
    }

    const { error } = await supabase.from("leave_requests").update({ status }).eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    await load();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="mx-auto max-w-6xl p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Leave Requests</h1>
            <p className="text-sm text-gray-500">Approve or reject requests</p>
          </div>

          <Link className="text-sm font-medium hover:underline flex items-center gap-1" href="/admin">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Admin Home
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          {err && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg mb-4">{err}</p>}
          {loading && <p className="text-gray-500">Loading...</p>}

          {!loading && (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="p-4 text-left font-semibold text-gray-700">Employee</th>
                    <th className="p-4 text-left font-semibold text-gray-700">Leave Type</th>
                    <th className="p-4 text-left font-semibold text-gray-700">From</th>
                    <th className="p-4 text-left font-semibold text-gray-700">To</th>
                    <th className="p-4 text-left font-semibold text-gray-700">Days</th>
                    <th className="p-4 text-left font-semibold text-gray-700">Reason</th>
                    <th className="p-4 text-left font-semibold text-gray-700">Status</th>
                    <th className="p-4 text-left font-semibold text-gray-700">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {rows.map((r) => {
                    const daysDiff = r.is_half_day 
                      ? 0.5 
                      : Math.ceil((new Date(r.to_date).getTime() - new Date(r.from_date).getTime()) / (1000 * 60 * 60 * 24)) + 1;
                    
                    return (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4 font-medium">{r.profiles?.name ?? r.user_id}</td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          r.leave_type === 'sick' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                        }`}>
                          {r.leave_type === 'sick' ? 'Sick' : 'Casual'}
                          {r.is_half_day && ` (${r.half_day_period === 'morning' ? 'Morning' : 'Evening'})`}
                        </span>
                      </td>
                      <td className="p-4 text-gray-600">{r.from_date}</td>
                      <td className="p-4 text-gray-600">{r.to_date}</td>
                      <td className="p-4 text-gray-600 font-medium">{daysDiff}</td>
                      <td className="p-4 text-gray-600">{r.reason}</td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          r.status === 'approved' ? 'bg-green-50 text-green-700' :
                          r.status === 'rejected' ? 'bg-red-50 text-red-700' :
                          r.status === 'cancelled' ? 'bg-gray-50 text-gray-700' :
                          'bg-yellow-50 text-yellow-700'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="p-4">
                        {r.status === "pending" ? (
                          <div className="flex gap-2">
                            <button
                              className="rounded-lg bg-black text-white px-4 py-1.5 text-xs font-medium hover:bg-gray-800 transition-colors"
                              onClick={() => setStatus(r.id, "approved")}
                            >
                              Approve
                            </button>
                            <button
                              className="rounded-lg border border-gray-300 px-4 py-1.5 text-xs font-medium hover:bg-gray-50 transition-colors"
                              onClick={() => setStatus(r.id, "rejected")}
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td className="p-4 text-center text-gray-400" colSpan={6}>
                        No leave requests yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
