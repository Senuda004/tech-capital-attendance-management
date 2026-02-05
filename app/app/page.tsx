"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import LogoutButton from "@/app/components/LogoutButton";
import Link from "next/link";

type AttendanceRow = {
  id: number;
  date: string; // YYYY-MM-DD
  check_in: string | null;
  check_out: string | null;
  location: string | null;
};

function todayYMD() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function minutesBetween(startIso: string, endIso: string) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const diffMs = end - start;
  return Math.max(0, Math.floor(diffMs / 60000));
}

function formatHM(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

export default function EmployeeAppPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState<string>("");
  const [row, setRow] = useState<AttendanceRow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [location, setLocation] = useState<string>("");
  const [sickLeaveBalance, setSickLeaveBalance] = useState<number>(0);
  const [casualLeaveBalance, setCasualLeaveBalance] = useState<number>(0);
  const date = todayYMD();

  async function loadToday() {
    setErr(null);
    setLoading(true);

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setErr("Not logged in");
      setLoading(false);
      router.replace("/login");
      return;
    }
    setUserId(u.user.id);

    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("name,role,sick_leave_balance,casual_leave_balance")
      .eq("id", u.user.id)
      .single();

    if (profErr) {
      setErr(profErr.message);
      setLoading(false);
      return;
    }

    // Redirect admin users to admin dashboard
    if (prof?.role === "admin") {
      router.replace("/admin");
      return;
    }

    setName(prof?.name ?? "");
    setSickLeaveBalance(prof?.sick_leave_balance ?? 7);
    setCasualLeaveBalance(prof?.casual_leave_balance ?? 14);

    const { data: att, error: attErr } = await supabase
      .from("attendance")
      .select("id,date,check_in,check_out,location")
      .eq("user_id", u.user.id)
      .eq("date", date)
      .maybeSingle();

    if (attErr) {
      setErr(attErr.message);
      setLoading(false);
      return;
    }

    setRow(att ?? null);
    setLoading(false);
  }

  useEffect(() => {
    loadToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkIn() {
    if (!userId) return;
    setErr(null);

    if (row?.check_in) {
      setErr("You already checked in today.");
      return;
    }

    if (!location.trim()) {
      setErr("Please enter your location.");
      return;
    }

    const { error } = await supabase.from("attendance").upsert(
      {
        user_id: userId,
        date,
        check_in: new Date().toISOString(),
        location: location.trim(),
      },
      { onConflict: "user_id,date" }
    );

    if (error) {
      setErr(error.message);
      return;
    }
    setLocation("");
    await loadToday();
  }

  async function checkOut() {
    if (!userId) return;
    setErr(null);

    if (!row?.check_in) {
      setErr("Please check in first.");
      return;
    }
    if (row?.check_out) {
      setErr("You already checked out today.");
      return;
    }

    const { error } = await supabase
      .from("attendance")
      .update({ check_out: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("date", date);

    if (error) {
      setErr(error.message);
      return;
    }
    await loadToday();
  }

  const status = (() => {
    if (!row?.check_in) return "Not checked in yet";
    if (row.check_in && !row.check_out) return "Checked in (not checked out)";
    return "Checked out ✅";
  })();

  const workedMinutes =
    row?.check_in && row?.check_out ? minutesBetween(row.check_in, row.check_out) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="mx-auto max-w-3xl p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Employee Portal</h1>
            <p className="text-sm text-gray-500">
              {name ? `Hi, ${name}` : "Hi"} • Today: {date}
            </p>
          </div>
          <LogoutButton />
        </div>

        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold text-gray-900">Leave Balance</div>
            <Link href="/app/leave" className="text-xs font-medium text-black hover:underline">Apply Leave →</Link>
          </div>
          <div className="flex gap-4">
            <div className="flex-1 bg-white rounded-xl p-4 shadow-sm">
              <div className="text-xs text-gray-600 mb-1">Sick Leave</div>
              <div className="text-3xl font-bold text-gray-900">{sickLeaveBalance}</div>
              <div className="text-xs text-gray-500">days remaining</div>
            </div>
            <div className="flex-1 bg-white rounded-xl p-4 shadow-sm">
              <div className="text-xs text-gray-600 mb-1">Casual Leave</div>
              <div className="text-3xl font-bold text-gray-900">{casualLeaveBalance}</div>
              <div className="text-xs text-gray-500">days remaining</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-gray-500">Today's Status</div>
            <div className={`px-3 py-1 rounded-full text-xs font-medium ${
              row?.check_in && row?.check_out ? 'bg-green-50 text-green-700' :
              row?.check_in ? 'bg-blue-50 text-blue-700' :
              'bg-gray-50 text-gray-700'
            }`}>
              {loading ? "Loading..." : status}
            </div>
          </div>

          {row?.check_in && (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Check-in</span>
                <span className="font-medium">{new Date(row.check_in).toLocaleTimeString()}</span>
              </div>
              {row?.location && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Location</span>
                  <span className="font-medium">{row.location}</span>
                </div>
              )}
              {row?.check_out && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Check-out</span>
                  <span className="font-medium">{new Date(row.check_out).toLocaleTimeString()}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Total Worked</span>
                <span className="font-semibold text-black">
                  {workedMinutes !== null ? formatHM(workedMinutes) : "In progress…"}
                </span>
              </div>
            </div>
          )}
        </div>

        {!row?.check_in && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Location *
            </label>
            <input
              type="text"
              className="w-full rounded-xl border-2 border-gray-300 p-3 focus:ring-2 focus:ring-black focus:border-black transition-all outline-none text-gray-900 placeholder-gray-500"
              placeholder="e.g., Head Office, Colombo, Main Outlet"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
        )}

        <Link
          href="/app/leave"
          className="flex items-center justify-between bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-4 hover:shadow-md hover:border-gray-300 transition-all duration-200"
        >
          <div>
            <div className="font-semibold mb-1">Apply for Leave</div>
            <div className="text-sm text-gray-500">Request time off</div>
          </div>
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>

        {err && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{err}</p>}

        <div className="grid gap-4 sm:grid-cols-2">
          <button
            onClick={checkIn}
            className="rounded-xl bg-black text-white p-4 font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
            disabled={loading || !!row?.check_in}
          >
            ✓ Check In
          </button>

          <button
            onClick={checkOut}
            className="rounded-xl border-2 border-black p-4 font-medium hover:bg-black hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            disabled={loading || !row?.check_in || !!row?.check_out}
          >
            ✓ Check Out
          </button>
        </div>
      </div>
    </div>
  );
}
