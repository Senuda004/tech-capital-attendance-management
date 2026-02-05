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


export default function LeaveRequestPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();
  const [fromDate, setFromDate] = useState<Date>(todayDate());
  const [toDate, setToDate] = useState<Date>(todayDate());
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    async function checkRole() {
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
      })
      .select("id")
      .single();

    if (insErr) {
      setErr(insErr.message);
      setLoading(false);
      return;
    }

    try {
      await emailjs.send(
        process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID!,
        process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID!,
        {
          to_email: process.env.NEXT_PUBLIC_ADMIN_EMAIL!,
          employee_name: prof?.name ?? "Employee",
          from_date: fromYMDStr,
          to_date: toYMDStr,
          reason: reason.trim(),
          request_id: leave.id,
        },
        { publicKey: process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY! }
      );

      setMsg("Leave request submitted ✅ (email sent)");
      setReason("");
    } catch {
      setMsg("Leave request submitted ✅ (email failed to send)");
    }

    setLoading(false);
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
      </div>
    </div>
  );
}
