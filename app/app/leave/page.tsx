"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import emailjs from "@emailjs/browser";
import { supabaseBrowser } from "@/lib/supabase/client";
import LogoutButton from "@/app/components/LogoutButton";
import Link from "next/link";
import { DayPicker } from "react-day-picker";
import { format } from "date-fns";

function todayDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromYMD(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function PopDatePicker({
  label,
  value,
  onChange,
  minDate,
}: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  minDate?: Date;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2 relative">
      <label className="text-sm font-medium text-gray-700">{label}</label>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-xl border border-gray-300 bg-white p-3 text-left hover:bg-gray-50 transition-colors focus:ring-2 focus:ring-black focus:border-transparent outline-none text-gray-900"
      >
        <span className="font-semibold text-gray-900">{format(value, "yyyy-MM-dd")}</span>{" "}
        <span className="text-gray-600">({format(value, "EEE")})</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-2 w-fit rounded-2xl border border-gray-300 bg-white p-4 shadow-xl">
          <DayPicker
            mode="single"
            selected={value}
            onSelect={(d) => {
              if (!d) return;
              onChange(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
              setOpen(false);
            }}
            disabled={minDate ? { before: minDate } : undefined}
            classNames={{
              caption: "flex items-center justify-between px-2 py-2 text-gray-900",
              caption_label: "text-sm font-bold text-gray-900",
              nav: "flex items-center gap-2",
              nav_button:
                "h-8 w-8 rounded-lg border border-gray-300 hover:bg-gray-100 flex items-center justify-center transition-colors text-gray-900",
              table: "w-full border-collapse",
              head_row: "flex",
              head_cell: "w-9 text-center text-xs font-bold text-gray-900",
              row: "mt-2 flex w-full",
              cell: "w-9 h-9 text-center",
              day: "w-9 h-9 rounded-lg hover:bg-gray-100 transition-colors text-gray-900 font-medium",
              day_selected: "bg-black text-white hover:bg-black font-bold",
              day_today: "border-2 border-black font-bold",
              day_outside: "text-gray-400 opacity-60",
              day_disabled: "text-gray-400 opacity-40",
            }}
          />

          <div className="mt-3 flex justify-end border-t border-gray-200 pt-3">
            <button
              type="button"
              className="text-sm font-semibold text-gray-900 hover:text-black"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


type LeaveRequest = {
  id: string;
  from_date: string;
  to_date: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  leave_type: "annual" | "casual";
  created_at: string;
};

export default function LeaveRequestPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();
  const [fromDate, setFromDate] = useState<Date>(todayDate());
  const [toDate, setToDate] = useState<Date>(todayDate());
  const [reason, setReason] = useState("");
  const [leaveType, setLeaveType] = useState<"annual" | "casual">("annual");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sickLeaveBalance, setSickLeaveBalance] = useState<number>(7);
  const [casualLeaveBalance, setCasualLeaveBalance] = useState<number>(14);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  useEffect(() => {
    async function checkRole() {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        router.replace("/login");
        return;
      }

      const { data: prof } = await supabase
        .from("profiles")
        .select("role,sick_leave_balance,casual_leave_balance")
        .eq("id", u.user.id)
        .single();

      if (prof?.role === "admin") {
        router.replace("/admin");
        return;
      }

      setSickLeaveBalance(prof?.sick_leave_balance ?? 7);
      setCasualLeaveBalance(prof?.casual_leave_balance ?? 14);

      // Load leave requests
      const { data: leaves } = await supabase
        .from("leave_requests")
        .select("id,from_date,to_date,reason,status,leave_type,created_at")
        .eq("user_id", u.user.id)
        .order("created_at", { ascending: false });

      if (leaves) {
        setLeaveRequests(leaves as LeaveRequest[]);
      }
    }
    checkRole();
  }, [supabase, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);

    if (!reason.trim()) {
      setErr("Please enter a reason.");
      return;
    }

    const fromYMDStr = toYMD(fromDate);
    const toYMDStr = toYMD(toDate);

    if (toYMDStr < fromYMDStr) {
      setErr("To date cannot be before From date.");
      return;
    }

    // Calculate number of days
    const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    // Check leave balance
    const currentBalance = leaveType === "annual" ? sickLeaveBalance : casualLeaveBalance;
    if (daysDiff > currentBalance) {
      setErr(`Insufficient leave balance. You have ${currentBalance} days remaining for ${leaveType} leave.`);
      return;
    }

    setLoading(true);

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setErr("Not logged in");
      setLoading(false);
      return;
    }

    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", u.user.id)
      .single();

    if (profErr) {
      setErr(profErr.message);
      setLoading(false);
      return;
    }

    const { data: leave, error: insErr } = await supabase
      .from("leave_requests")
      .insert({
        user_id: u.user.id,
        from_date: fromYMDStr,
        to_date: toYMDStr,
        reason: reason.trim(),
        status: "pending",
        leave_type: leaveType,
      })
      .select("id")
      .single();

    if (insErr) {
      setErr(insErr.message);
      setLoading(false);
      return;
    }

    // Deduct leave balance immediately
    const balanceColumn = leaveType === "annual" ? "sick_leave_balance" : "casual_leave_balance";
    const newBalance = currentBalance - daysDiff;

    console.log("Updating balance:", { balanceColumn, currentBalance, newBalance, daysDiff, userId: u.user.id });

    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ [balanceColumn]: newBalance })
      .eq("id", u.user.id);

    if (updateErr) {
      console.error("Failed to update balance:", updateErr);
      setErr(`Leave submitted but balance update failed: ${updateErr.message}`);
    } else {
      console.log("Balance updated successfully");
      // Update local state
      if (leaveType === "annual") {
        setSickLeaveBalance(newBalance);
      } else {
        setCasualLeaveBalance(newBalance);
      }
    }

    try {
      console.log("Sending email with params:", {
        serviceId: process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID,
        templateId: process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID,
        publicKey: process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY,
      });

      await emailjs.send(
        process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID!,
        process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID!,
        {
          employee_name: prof?.name ?? "Employee",
          from_date: fromYMDStr,
          to_date: toYMDStr,
          reason: reason.trim(),
          request_id: leave.id,
        },
        process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY!
      );

      setMsg("Leave request submitted ✅ (email sent)");
      setReason("");
    } catch (emailError: any) {
      console.error("Email error:", emailError);
      setMsg("Leave request submitted ✅ (email failed to send)");
    }

    // Reload leave requests
    const { data: leaves } = await supabase
      .from("leave_requests")
      .select("id,from_date,to_date,reason,status,leave_type,created_at")
      .eq("user_id", u.user.id)
      .order("created_at", { ascending: false });

    if (leaves) {
      setLeaveRequests(leaves as LeaveRequest[]);
    }

    setLoading(false);
  }

  async function cancelLeave(leaveId: string, leaveType: "annual" | "casual", fromDate: string, toDate: string) {
    if (!confirm("Are you sure you want to cancel this leave request?")) {
      return;
    }

    setCancelingId(leaveId);
    setErr(null);
    setMsg(null);

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setErr("Not logged in");
      setCancelingId(null);
      return;
    }

    // Calculate days to restore
    const from = fromYMD(fromDate);
    const to = fromYMD(toDate);
    const daysDiff = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // First, verify the leave request exists and is pending
    const { data: checkData, error: checkError } = await supabase
      .from("leave_requests")
      .select("id, status, user_id")
      .eq("id", parseInt(leaveId))
      .single();

    console.log("Check leave request:", { checkData, checkError, leaveId: parseInt(leaveId) });

    if (checkError || !checkData) {
      console.error("Leave request not found:", checkError);
      setErr("Leave request not found");
      setCancelingId(null);
      return;
    }

    if (checkData.user_id !== u.user.id) {
      console.error("Unauthorized: Leave request belongs to another user");
      setErr("Unauthorized to cancel this leave request");
      setCancelingId(null);
      return;
    }

    if (checkData.status !== "pending") {
      console.error("Cannot cancel: status is", checkData.status);
      setErr(`Cannot cancel: Leave request is already ${checkData.status}`);
      setCancelingId(null);
      return;
    }

    // Update the leave request status to 'cancelled'
    const { data: updateData, error: updateStatusErr } = await supabase
      .from("leave_requests")
      .update({ status: "cancelled" })
      .eq("id", parseInt(leaveId))
      .eq("user_id", u.user.id)
      .select();

    console.log("Cancel update result:", { updateData, updateStatusErr, leaveId, parsedId: parseInt(leaveId) });

    if (updateStatusErr) {
      console.error("Cancel error:", updateStatusErr);
      setErr(`Failed to cancel leave: ${updateStatusErr.message}`);
      setCancelingId(null);
      return;
    }

    if (!updateData || updateData.length === 0) {
      console.error("No rows updated");
      setErr("Failed to cancel leave: No matching request found");
      setCancelingId(null);
      return;
    }

    // Update the leave request status in the local state immediately
    setLeaveRequests((prev) =>
      prev.map((leave) =>
        leave.id === leaveId ? { ...leave, status: "cancelled" as const } : leave
      )
    );

    // Restore leave balance
    const balanceColumn = leaveType === "annual" ? "sick_leave_balance" : "casual_leave_balance";
    const currentBalance = leaveType === "annual" ? sickLeaveBalance : casualLeaveBalance;
    const newBalance = currentBalance + daysDiff;

    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ [balanceColumn]: newBalance })
      .eq("id", u.user.id);

    if (updateErr) {
      console.error("Balance update error:", updateErr);
      setErr(`Leave cancelled but balance restore failed: ${updateErr.message}`);
    } else {
      // Update local state
      if (leaveType === "annual") {
        setSickLeaveBalance(newBalance);
      } else {
        setCasualLeaveBalance(newBalance);
      }
      setMsg("Leave request cancelled successfully ✅");
    }

    setCancelingId(null);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="mx-auto max-w-3xl p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2 text-gray-900">Apply for Leave</h1>
            <p className="text-sm text-gray-600">Send a request to admin</p>
          </div>
          <LogoutButton />
        </div>

        <Link className="text-sm font-medium text-gray-900 hover:underline flex items-center gap-1" href="/app">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Attendance
        </Link>

        <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 space-y-6">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
            <div className="flex justify-between text-sm mb-2">
              <span className="font-semibold text-gray-900">Leave Balance</span>
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <div className="text-xs text-gray-600 mb-1">Sick Leave</div>
                <div className="text-2xl font-bold text-gray-900">{sickLeaveBalance}</div>
                <div className="text-xs text-gray-500">days remaining</div>
              </div>
              <div className="flex-1">
                <div className="text-xs text-gray-600 mb-1">Casual Leave</div>
                <div className="text-2xl font-bold text-gray-900">{casualLeaveBalance}</div>
                <div className="text-xs text-gray-500">days remaining</div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-900">Leave Type</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="leaveType"
                  value="annual"
                  checked={leaveType === "annual"}
                  onChange={(e) => setLeaveType(e.target.value as "annual" | "casual")}
                  className="w-4 h-4 text-black focus:ring-black"
                />
                <span className="text-sm font-medium text-gray-900">Sick Leave ({sickLeaveBalance} days left)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="leaveType"
                  value="casual"
                  checked={leaveType === "casual"}
                  onChange={(e) => setLeaveType(e.target.value as "annual" | "casual")}
                  className="w-4 h-4 text-black focus:ring-black"
                />
                <span className="text-sm font-medium text-gray-900">Casual Leave ({casualLeaveBalance} days left)</span>
              </label>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <PopDatePicker
              label="From Date"
              value={fromDate}
              onChange={(d) => {
                setFromDate(d);
                // if To is before From, auto-fix To
                if (toYMD(toDate) < toYMD(d)) setToDate(d);
              }}
              minDate={todayDate()}
            />

            <PopDatePicker
              label="To Date"
              value={toDate}
              onChange={setToDate}
              minDate={fromDate}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-900">Reason</label>
            <textarea
              className="w-full rounded-xl border-2 border-gray-300 p-3 focus:ring-2 focus:ring-black focus:border-black transition-all outline-none resize-none text-gray-900 placeholder-gray-500"
              rows={5}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., personal work, sick leave, family emergency..."
              required
            />
          </div>

          {err && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{err}</p>}
          {msg && <p className="text-sm text-green-700 bg-green-50 p-3 rounded-lg">{msg}</p>}

          <button
            disabled={loading}
            className="w-full rounded-xl bg-black text-white p-3 font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {loading ? "Submitting..." : "Submit Leave Request"}
          </button>
        </form>

        {/* Leave Requests List */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6">My Leave Requests</h2>

          {leaveRequests.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No leave requests yet.</p>
          ) : (
            <div className="space-y-4">
              {leaveRequests.map((leave) => (
                <div
                  key={leave.id}
                  className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <span
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                            leave.status === "approved"
                              ? "bg-green-50 text-green-700"
                              : leave.status === "rejected"
                              ? "bg-red-50 text-red-700"
                              : leave.status === "cancelled"
                              ? "bg-gray-50 text-gray-700"
                              : "bg-yellow-50 text-yellow-700"
                          }`}
                        >
                          {leave.status.charAt(0).toUpperCase() + leave.status.slice(1)}
                        </span>
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                          {leave.leave_type === "annual" ? "Sick Leave" : "Casual Leave"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-sm text-gray-900 font-semibold mb-2">
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {format(fromYMD(leave.from_date), "yyyy-MM-dd")} → {format(fromYMD(leave.to_date), "yyyy-MM-dd")}
                      </div>

                      <div className="text-sm text-gray-600 mb-2">
                        <span className="font-medium text-gray-700">Reason:</span> {leave.reason}
                      </div>

                      <div className="text-xs text-gray-500">
                        Requested on {format(new Date(leave.created_at), "MMM dd, yyyy 'at' hh:mm a")}
                      </div>
                    </div>

                    <div>
                      <button
                        onClick={() => cancelLeave(leave.id, leave.leave_type, leave.from_date, leave.to_date)}
                        disabled={leave.status !== "pending" || cancelingId === leave.id}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          leave.status !== "pending"
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                            : "bg-red-50 text-red-700 hover:bg-red-100"
                        }`}
                        title={
                          leave.status === "approved" 
                            ? "Cannot cancel approved requests" 
                            : leave.status === "rejected"
                            ? "Cannot cancel rejected requests"
                            : leave.status === "cancelled"
                            ? "Already cancelled"
                            : "Cancel this request"
                        }
                      >
                        {cancelingId === leave.id ? "Canceling..." : "Cancel"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
