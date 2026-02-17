import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    // Optional: Add authorization header check for security
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get today's date in YYYY-MM-DD format
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const todayYMD = `${year}-${month}-${day}`;

    // Set checkout time to 6:00 PM today
    const checkoutTime = new Date(year, now.getMonth(), now.getDate(), 18, 0, 0);
    const checkoutISO = checkoutTime.toISOString();

    // Find all attendance records for today where check_in exists but check_out is null
    const { data: attendanceRecords, error: fetchError } = await supabaseAdmin
      .from("attendance")
      .select("id, user_id, check_in")
      .eq("date", todayYMD)
      .is("check_out", null)
      .not("check_in", "is", null);

    if (fetchError) {
      console.error("Error fetching attendance records:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch attendance records", details: fetchError.message },
        { status: 500 }
      );
    }

    if (!attendanceRecords || attendanceRecords.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No records to auto-checkout",
        count: 0,
      });
    }

    // Update all records to check out at 6:00 PM
    const { error: updateError, count } = await supabaseAdmin
      .from("attendance")
      .update({ check_out: checkoutISO })
      .eq("date", todayYMD)
      .is("check_out", null)
      .not("check_in", "is", null);

    if (updateError) {
      console.error("Error updating attendance records:", updateError);
      return NextResponse.json(
        { error: "Failed to update attendance records", details: updateError.message },
        { status: 500 }
      );
    }

    console.log(`Auto-checkout completed: ${attendanceRecords.length} employees checked out at 6:00 PM`);

    return NextResponse.json({
      success: true,
      message: `Successfully auto-checked out ${attendanceRecords.length} employees at 6:00 PM`,
      count: attendanceRecords.length,
      checkoutTime: checkoutISO,
      date: todayYMD,
    });
  } catch (error: any) {
    console.error("Auto-checkout error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

// Optional: Allow GET for testing purposes (remove in production)
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get today's date in YYYY-MM-DD format
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const todayYMD = `${year}-${month}-${day}`;

  // Find records that would be auto-checked out
  const { data: attendanceRecords, error } = await supabaseAdmin
    .from("attendance")
    .select("id, user_id, check_in, profiles(name)")
    .eq("date", todayYMD)
    .is("check_out", null)
    .not("check_in", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    message: "Preview of employees who would be auto-checked out",
    count: attendanceRecords?.length || 0,
    date: todayYMD,
    employees: attendanceRecords,
  });
}
