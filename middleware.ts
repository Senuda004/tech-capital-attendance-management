import { NextRequest } from "next/server";
import { supabaseMiddleware } from "@/lib/supabase/middleware";

export async function middleware(req: NextRequest) {
  const { supabase, res } = supabaseMiddleware(req);

  const { data } = await supabase.auth.getUser();
  const isLoggedIn = !!data.user;

  const path = req.nextUrl.pathname;

  const isProtected =
    path.startsWith("/app") || path.startsWith("/admin");

  // Redirect to login if not logged in
  if (isProtected && !isLoggedIn) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return Response.redirect(url);
  }

  // Role-based access control
  if (isLoggedIn && data.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    const userRole = profile?.role;

    // Prevent employees from accessing admin routes
    if (path.startsWith("/admin") && userRole === "employee") {
      const url = req.nextUrl.clone();
      url.pathname = "/app";
      return Response.redirect(url);
    }

    // Prevent admins from accessing employee routes
    if (path.startsWith("/app") && userRole === "admin") {
      const url = req.nextUrl.clone();
      url.pathname = "/admin";
      return Response.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*"],
};
