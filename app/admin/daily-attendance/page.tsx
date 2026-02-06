"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { isNonWorkingDay } from "@/lib/nonWorkingDays";

type Profile = { id: string; name: string; role: string; created_at: string };
type AttendanceRow = {
  user_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  location: string | null;
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

export default function DailyAttendancePage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(ymd(new Date()));
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

    const profRes = await supabase
      .from("profiles")
      .select("id,name,role,created_at")
      .eq("role", "employee")
      .order("name", { ascending: true });

    if (profRes.error) {
      setErr(profRes.error.message);
      setLoading(false);
      return;
    }

    const attRes = await supabase
      .from("attendance")
      .select("user_id,date,check_in,check_out,location")
      .eq("date", selectedDate);

    if (attRes.error) {
      setErr(attRes.error.message);
      setLoading(false);
      return;
    }

    const leaveRes = await supabase
      .from("leave_requests")
      .select("user_id,from_date,to_date,status")
      .in("status", ["approved", "pending"])
      .lte("from_date", selectedDate)
      .gte("to_date", selectedDate);

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
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const report = useMemo(() => {
    const attMap = new Map<string, AttendanceRow>();
    attendance.forEach((a) => attMap.set(a.user_id, a));

    const leaveByUser = new Map<string, LeaveRow[]>();
    leaves.forEach((l) => {
      const arr = leaveByUser.get(l.user_id) ?? [];
      arr.push(l);
      leaveByUser.set(l.user_id, arr);
    });

    const isWeekendOrHoliday = isNonWorkingDay(selectedDate);

    return profiles.filter((p) => {
      // Filter out employees who weren't enrolled on the selected date
      const joinYMD = p.created_at?.slice(0, 10) ?? "0000-00-00";
      return selectedDate >= joinYMD;
    }).map((p) => {
      const myLeaves = leaveByUser.get(p.id) ?? [];
      const approved = isApprovedLeave(selectedDate, myLeaves);
      const pending = isPendingLeave(selectedDate, myLeaves);
      const att = attMap.get(p.id);

      let status = "Absent";
      let checkIn = null;
      let checkOut = null;
      let location = null;

      if (isWeekendOrHoliday) {
        status = "Non-working day";
      } else if (approved) {
        status = "Approved Leave";
      } else if (pending) {
        status = "Pending Leave";
      } else if (att?.check_in) {
        status = att.check_out ? "Present" : "Checked In";
        checkIn = att.check_in;
        checkOut = att.check_out;
        location = att.location;
      }

      return {
        id: p.id,
        name: p.name,
        status,
        checkIn,
        checkOut,
        location,
      };
    });
  }, [profiles, attendance, leaves, selectedDate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="mx-auto max-w-7xl p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Daily Attendance</h1>
            <p className="text-sm text-gray-500">
              View employee check-in/check-out times and locations
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
            <label className="text-sm font-medium text-gray-700">Select Date</label>
            <input
              type="date"
              className="rounded-xl border border-gray-200 p-2.5 focus:ring-2 focus:ring-black focus:border-transparent transition-all outline-none"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
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
                    <th className="p-4 text-left font-semibold text-gray-700">Status</th>
                    <th className="p-4 text-left font-semibold text-gray-700">Check-in</th>
                    <th className="p-4 text-left font-semibold text-gray-700">Check-out</th>
                    <th className="p-4 text-left font-semibold text-gray-700">Location</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {report.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4 font-medium">{r.name}</td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          r.status === 'Present' ? 'bg-green-50 text-green-700' :
                          r.status === 'Checked In' ? 'bg-blue-50 text-blue-700' :
                          r.status === 'Approved Leave' ? 'bg-purple-50 text-purple-700' :
                          r.status === 'Pending Leave' ? 'bg-yellow-50 text-yellow-700' :
                          r.status === 'Non-working day' ? 'bg-gray-50 text-gray-700' :
                          'bg-red-50 text-red-700'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="p-4 text-gray-600">
                        {r.checkIn ? new Date(r.checkIn).toLocaleTimeString() : '—'}
                      </td>
                      <td className="p-4 text-gray-600">
                        {r.checkOut ? new Date(r.checkOut).toLocaleTimeString() : '—'}
                      </td>
                      <td className="p-4 text-gray-600">
                        {r.location || '—'}
                      </td>
                    </tr>
                  ))}

                  {report.length === 0 && (
                    <tr>
                      <td className="p-4 text-center text-gray-400" colSpan={5}>
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
