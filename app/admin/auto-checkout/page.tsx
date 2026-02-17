"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";

type PreviewEmployee = {
  id: number;
  user_id: string;
  check_in: string;
  profiles?: { name: string } | null;
};

export default function AutoCheckoutPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewEmployee[]>([]);
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

      if (prof?.role === "employee") {
        router.replace("/app");
        return;
      }

      setLoading(false);
    }
    checkRole();
  }, [supabase, router]);

  async function previewAutoCheckout() {
    setErr(null);
    setMsg(null);
    setPreviewing(true);

    try {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");
      const todayYMD = `${year}-${month}-${day}`;

      const { data, error } = await supabase
        .from("attendance")
        .select("id, user_id, check_in, profiles(name)")
        .eq("date", todayYMD)
        .is("check_out", null)
        .not("check_in", "is", null);

      if (error) {
        setErr(error.message);
        setPreviewing(false);
        return;
      }

      setPreviewData((data as any) ?? []);
      if (data && data.length > 0) {
        setMsg(`Found ${data.length} employee(s) who haven't checked out yet.`);
      } else {
        setMsg("No employees to auto-checkout. Everyone has already checked out!");
      }
    } catch (error: any) {
      setErr(error.message);
    } finally {
      setPreviewing(false);
    }
  }

  async function executeAutoCheckout() {
    if (!confirm("Are you sure you want to auto-checkout all employees who haven't checked out? This will set their checkout time to 6:00 PM.")) {
      return;
    }

    setErr(null);
    setMsg(null);
    setExecuting(true);

    try {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");
      const todayYMD = `${year}-${month}-${day}`;

      // Set checkout time to 6:00 PM today
      const checkoutTime = new Date(year, today.getMonth(), today.getDate(), 18, 0, 0);
      const checkoutISO = checkoutTime.toISOString();

      const { error, count } = await supabase
        .from("attendance")
        .update({ check_out: checkoutISO })
        .eq("date", todayYMD)
        .is("check_out", null)
        .not("check_in", "is", null);

      if (error) {
        setErr(error.message);
        setExecuting(false);
        return;
      }

      setMsg(`✅ Successfully auto-checked out ${count || 0} employee(s) at 6:00 PM!`);
      setPreviewData([]);
      
      // Refresh preview after execution
      setTimeout(() => previewAutoCheckout(), 2000);
    } catch (error: any) {
      setErr(error.message);
    } finally {
      setExecuting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100">
      <div className="mx-auto max-w-4xl p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Auto-Checkout Management</h1>
            <p className="text-sm text-gray-500">
              Manually trigger auto-checkout for employees who haven't checked out
            </p>
          </div>

          <Link
            className="text-sm font-medium hover:underline flex items-center gap-1"
            href="/admin"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Admin Home
          </Link>
        </div>

        {/* Info Card */}
        <div className="bg-blue-50 rounded-2xl border border-blue-200 p-6">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="font-semibold text-blue-900 mb-2">How Auto-Checkout Works</h3>
              <p className="text-sm text-blue-800 mb-3">
                The system automatically checks out employees at 6:00 PM if they checked in but forgot to check out. 
                This ensures accurate attendance tracking and prevents missing checkout records.
              </p>
              <p className="text-sm text-blue-800">
                You can preview which employees would be affected before executing the auto-checkout.
              </p>
            </div>
          </div>
        </div>

        {/* Actions Card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-xl font-bold mb-4">Actions</h2>

          <div className="flex gap-4 mb-6">
            <button
              onClick={previewAutoCheckout}
              disabled={previewing}
              className="flex-1 rounded-xl bg-black text-white p-4 font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {previewing ? "Loading..." : "Preview Employees"}
            </button>

            <button
              onClick={executeAutoCheckout}
              disabled={executing || previewData.length === 0}
              className="flex-1 rounded-xl bg-red-600 text-white p-4 font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {executing ? "Executing..." : "Execute Auto-Checkout"}
            </button>
          </div>

          {err && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg mb-4">{err}</p>}
          {msg && <p className="text-sm text-green-700 bg-green-50 p-3 rounded-lg mb-4">{msg}</p>}

          {/* Preview List */}
          {previewData.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-3">
                Employees to be Auto-Checked Out ({previewData.length})
              </h3>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="p-4 text-left font-semibold text-gray-700">Employee</th>
                      <th className="p-4 text-left font-semibold text-gray-700">Check-in Time</th>
                      <th className="p-4 text-left font-semibold text-gray-700">Will be checked out at</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {previewData.map((emp) => (
                      <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                        <td className="p-4 font-medium">
                          {emp.profiles?.name || emp.user_id}
                        </td>
                        <td className="p-4 text-gray-600">
                          {new Date(emp.check_in).toLocaleTimeString()}
                        </td>
                        <td className="p-4 text-gray-600 font-semibold">
                          6:00 PM
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Setup Instructions Card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-xl font-bold mb-4">Automated Setup</h2>
          <p className="text-sm text-gray-600 mb-4">
            This page allows you to manually trigger auto-checkout. For automated daily checkout at 6:00 PM, 
            you need to set up a cron job or scheduled task.
          </p>
          <Link
            href="/AUTO-CHECKOUT-SETUP.md"
            target="_blank"
            className="inline-flex items-center gap-2 text-sm font-medium text-black hover:underline"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            View Setup Instructions
          </Link>
        </div>
      </div>
    </div>
  );
}
