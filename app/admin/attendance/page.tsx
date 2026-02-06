"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { isNonWorkingDay } from "@/lib/nonWorkingDays";

type Profile = { 
  id: string; 
  name: string; 
  role: string; 
  created_at: string;
  sick_leave_balance: number;
  casual_leave_balance: number;
};
type AttendanceRow = {
  user_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
};
type LeaveRow = {
  user_id: string;
  from_date: string;
  to_date: string;
  status: "pending" | "approved" | "rejected" | string;
};

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthRange(monthValue: string) {
  // monthValue: "2026-02"
  const [Y, M] = monthValue.split("-").map(Number);
  const start = new Date(Y, M - 1, 1);
  const end = new Date(Y, M, 0); // last day of month
  return { startYMD: ymd(start), endYMD: ymd(end), start, end };
}

function listDaysInMonth(start: Date, end: Date) {
  const days: string[] = [];
  const d = new Date(start);
  while (d <= end) {
    days.push(ymd(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function minutesBetween(startIso: string, endIso: string) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  return Math.max(0, Math.floor((end - start) / 60000));
}

function formatHM(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

function isApprovedLeave(date: string, leaveRows: LeaveRow[]) {
  return leaveRows.some(
    (l) => l.status === "approved" && l.from_date <= date && date <= l.to_date
  );
}

function isPendingLeave(date: string, leaveRows: LeaveRow[]) {
  return leaveRows.some(
    (l) => l.status === "pending" && l.from_date <= date && date <= l.to_date
  );
}

export default function AdminAttendancePage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();
  const now = new Date();
  const [month, setMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
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

    const { startYMD, endYMD } = monthRange(month);

    const profRes = await supabase
      .from("profiles")
      .select("id,name,role,created_at,sick_leave_balance,casual_leave_balance")
      .eq("role", "employee")
      .order("name", { ascending: true });

    if (profRes.error) {
      setErr(profRes.error.message);
      setLoading(false);
      return;
    }

    const attRes = await supabase
      .from("attendance")
      .select("user_id,date,check_in,check_out")
      .gte("date", startYMD)
      .lte("date", endYMD);

    if (attRes.error) {
      setErr(attRes.error.message);
      setLoading(false);
      return;
    }

    // IMPORTANT: only approved + pending are needed for the report
    const leaveRes = await supabase
      .from("leave_requests")
      .select("user_id,from_date,to_date,status")
      .in("status", ["approved", "pending"])
      .lte("from_date", endYMD)
      .gte("to_date", startYMD);

    if (leaveRes.error) {
      setErr(leaveRes.error.message);
      setLoading(false);
      return;
    }

    setProfiles((profRes.data as any) ?? []);
    setAttendance((attRes.data as any) ?? []);
    setLeaves((leaveRes.data as any) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // Always reload data when component mounts or month changes
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);
  
  // Also reload when navigating back to this page
  useEffect(() => {
    // This runs every time the component mounts
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const report = useMemo(() => {
    const { start, end, endYMD } = monthRange(month);
    const days = listDaysInMonth(start, end);
    const todayYMD = ymd(new Date());

    const attMap = new Map<string, AttendanceRow>();
    attendance.forEach((a) => attMap.set(`${a.user_id}__${a.date}`, a));

    const leaveByUser = new Map<string, LeaveRow[]>();
    leaves.forEach((l) => {
      const arr = leaveByUser.get(l.user_id) ?? [];
      arr.push(l);
      leaveByUser.set(l.user_id, arr);
    });

    return profiles.filter((p) => {
      // Filter out employees who weren't enrolled by the end of the selected month
      const joinYMD = p.created_at?.slice(0, 10) ?? "0000-00-00";
      return joinYMD <= endYMD;
    }).map((p) => {
      let presentDays = 0;
      let absentDays = 0;
      let approvedLeaveDays = 0;
      let pendingLeaveDays = 0;
      let workedMinutes = 0;

      const myLeaves = leaveByUser.get(p.id) ?? [];

      // Only count from the day the employee was created/added
      const joinYMD = p.created_at?.slice(0, 10) ?? "0000-00-00";

      for (const d of days) {
        if (isNonWorkingDay(d)) continue;
        if (d < joinYMD) continue;

        const approved = isApprovedLeave(d, myLeaves);
        const pending = isPendingLeave(d, myLeaves);

        // Check leave status first - count leaves even for future dates
        if (approved) {
          approvedLeaveDays += 1;
          continue;
        }

        if (pending) {
          pendingLeaveDays += 1;
          continue;
        }

        // Don't count future days as absent or present
        if (d > todayYMD) continue;

        // Only check attendance if there's no leave
        const a = attMap.get(`${p.id}__${d}`);

        if (a?.check_in) {
          presentDays += 1;
          if (a.check_in && a.check_out) {
            workedMinutes += minutesBetween(a.check_in, a.check_out);
          }
          continue;
        }

        // No check-in and no leave for a working day
        absentDays += 1;
      }

      return {
        id: p.id,
        name: p.name,
        presentDays,
        approvedLeaveDays,
        pendingLeaveDays,
        absentDays,
        workedMinutes,
        sickLeaveBalance: p.sick_leave_balance ?? 7,
        casualLeaveBalance: p.casual_leave_balance ?? 14,
      };
    });
  }, [profiles, attendance, leaves, month]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="mx-auto max-w-6xl p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Attendance Report</h1>
            <p className="text-sm text-gray-500">
              Excludes Saturdays/Sundays and Mercantile holidays
            </p>
          </div>

          <Link className="text-sm font-medium hover:underline flex items-center gap-1" href="/admin">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Admin Home
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-6">
            <label className="text-sm font-medium text-gray-700">Select Month</label>
            <input
              type="month"
              className="rounded-xl border border-gray-200 p-2.5 focus:ring-2 focus:ring-black focus:border-transparent transition-all outline-none"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>

          {err && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg mb-4">{err}</p>}
          {loading && <p className="text-gray-500">Loading...</p>}

          {!loading && (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="p-4 text-left font-semibold text-gray-700">Employee</th>
                    <th className="p-4 text-left font-semibold text-gray-700">Present</th>
                    <th className="p-4 text-left font-semibold text-gray-700">Approved Leave</th>
                    <th className="p-4 text-left font-semibold text-gray-700">Pending</th>
                    <th className="p-4 text-left font-semibold text-gray-700">Absent</th>
                    <th className="p-4 text-left font-semibold text-gray-700">Total Worked</th>
                    <th className="p-4 text-left font-semibold text-gray-700">Sick Leave</th>
                    <th className="p-4 text-left font-semibold text-gray-700">Casual Leave</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {report.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4 font-medium">{r.name}</td>
                      <td className="p-4 text-green-600 font-medium">{r.presentDays}</td>
                      <td className="p-4 text-blue-600 font-medium">{r.approvedLeaveDays}</td>
                      <td className="p-4 text-yellow-600 font-medium">{r.pendingLeaveDays}</td>
                      <td className="p-4 text-red-600 font-semibold">{r.absentDays}</td>
                      <td className="p-4 font-medium">{formatHM(r.workedMinutes)}</td>
                      <td className="p-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                          {r.sickLeaveBalance} days
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700">
                          {r.casualLeaveBalance} days
                        </span>
                      </td>
                    </tr>
                  ))}

                  {report.length === 0 && (
                    <tr>
                      <td className="p-4 text-center text-gray-400" colSpan={8}>
                        No employees found.
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
