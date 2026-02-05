"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    // fetch role from profiles
    const { data: prof, error: pErr } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    setLoading(false);

    if (pErr) {
      setErr(pErr.message);
      return;
    }

    router.replace(prof.role === "admin" ? "/admin" : "/app");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-gray-50 to-gray-100">
      <form onSubmit={onSubmit} className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-8 space-y-6">
        <div className="text-center space-y-4">
          <img src="/tech-capital-logo.png" alt="Tech Capital" className="h-40 mx-auto" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tech Capital Managed Services</h1>
            <p className="text-sm text-gray-500 mt-2">Sign in to your account</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Email</label>
            <input
              className="w-full border border-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-black focus:border-transparent transition-all outline-none"
              placeholder="you@example.com"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Password</label>
            <input
              className="w-full border border-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-black focus:border-transparent transition-all outline-none"
              placeholder="••••••••"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        {err && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{err}</p>}

        <button
          disabled={loading}
          className="w-full rounded-xl bg-black text-white p-3 font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
