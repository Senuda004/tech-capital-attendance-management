import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  // 1) Verify caller is logged-in and is admin
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: prof, error: profErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  if (profErr || !prof || prof.role !== "admin") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // 2) Read payload
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const tempPassword = String(body.tempPassword ?? "").trim();

  if (!name || !email || tempPassword.length < 6) {
    return NextResponse.json(
      { error: "Name, email required. Temp password must be 6+ chars." },
      { status: 400 }
    );
  }

  // 3) Create Auth user
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });

  if (error || !data.user) {
    return NextResponse.json({ error: error?.message ?? "Create user failed" }, { status: 400 });
  }

  // 4) Insert profile row
  const { error: pErr } = await supabaseAdmin
    .from("profiles")
    .insert({ 
      id: data.user.id, 
      name, 
      role: "employee",
      sick_leave_balance: 7,
      casual_leave_balance: 14
    });

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, userId: data.user.id });
}
