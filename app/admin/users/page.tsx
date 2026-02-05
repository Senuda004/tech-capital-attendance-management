"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function AdminUsersPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      }
    }
    checkRole();
  }, [supabase, router]);

  async function createEmployee(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    setLoading(true);

    const res = await fetch("/api/admin/create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, tempPassword }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setErr(data.error ?? "Failed");
      return;
    }

    setMsg("Employee account created ✅");
    setName("");
    setEmail("");
    setTempPassword("");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="mx-auto max-w-2xl p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Create Employee Account</h1>
            <p className="text-sm text-gray-500">Add a new employee to the system</p>
          </div>
          <Link className="text-sm font-medium hover:underline flex items-center gap-1" href="/admin">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Admin Home
          </Link>
        </div>

        <form onSubmit={createEmployee} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Full Name</label>
            <input
              className="w-full rounded-xl border border-gray-200 p-3 focus:ring-2 focus:ring-black focus:border-transparent transition-all outline-none"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Kasun Perera"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Email Address</label>
            <input
              className="w-full rounded-xl border border-gray-200 p-3 focus:ring-2 focus:ring-black focus:border-transparent transition-all outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g., kasun@company.com"
              type="email"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Temporary Password</label>
            <input
              className="w-full rounded-xl border border-gray-200 p-3 focus:ring-2 focus:ring-black focus:border-transparent transition-all outline-none"
              value={tempPassword}
              onChange={(e) => setTempPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              type="password"
              required
            />
            <p className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
              💡 Share this password with the employee and ask them to change it after first login.
            </p>
          </div>

          {err && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{err}</p>}
          {msg && <p className="text-sm text-green-700 bg-green-50 p-3 rounded-lg">{msg}</p>}

          <button
            disabled={loading}
            className="w-full rounded-xl bg-black text-white p-3 font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {loading ? "Creating..." : "Create Employee"}
          </button>
        </form>
      </div>
    </div>
  );
}
