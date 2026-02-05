"use client";

import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LogoutButton() {
  const supabase = supabaseBrowser();
  const router = useRouter();

  return (
    <button
      className="rounded-xl border-2 border-gray-900 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-black hover:text-white hover:border-black transition-all"
      onClick={async () => {
        await supabase.auth.signOut();
        router.replace("/login");
      }}
    >
      Logout
    </button>
  );
}
