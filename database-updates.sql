-- Add leave balance columns to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS sick_leave_balance NUMERIC(5,1) DEFAULT 7,
ADD COLUMN IF NOT EXISTS casual_leave_balance NUMERIC(5,1) DEFAULT 14;

-- Update existing INTEGER columns to NUMERIC to support half-day leaves (0.5 values)
-- Only run if columns already exist as INTEGER
DO $$ 
BEGIN
  -- Check and alter sick_leave_balance if it's INTEGER
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' 
    AND column_name = 'sick_leave_balance' 
    AND data_type = 'integer'
  ) THEN
    ALTER TABLE profiles ALTER COLUMN sick_leave_balance TYPE NUMERIC(5,1);
  END IF;
  
  -- Check and alter casual_leave_balance if it's INTEGER
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' 
    AND column_name = 'casual_leave_balance' 
    AND data_type = 'integer'
  ) THEN
    ALTER TABLE profiles ALTER COLUMN casual_leave_balance TYPE NUMERIC(5,1);
  END IF;
END $$;

-- Add leave_type column to leave_requests table
ALTER TABLE leave_requests 
ADD COLUMN IF NOT EXISTS leave_type TEXT CHECK (leave_type IN ('sick', 'casual')) DEFAULT 'sick';

-- Update existing 'annual' values to 'sick' for clarity
UPDATE leave_requests SET leave_type = 'sick' WHERE leave_type = 'annual';

-- Drop old leave_type constraint and add new one with 'sick' instead of 'annual'
ALTER TABLE leave_requests 
DROP CONSTRAINT IF EXISTS leave_requests_leave_type_check;

ALTER TABLE leave_requests 
ADD CONSTRAINT leave_requests_leave_type_check 
CHECK (leave_type IN ('sick', 'casual'));

-- Update status column to support 'cancelled' status
-- First, drop the existing constraint
ALTER TABLE leave_requests 
DROP CONSTRAINT IF EXISTS leave_requests_status_check;

-- Add new constraint with 'cancelled' status
ALTER TABLE leave_requests 
ADD CONSTRAINT leave_requests_status_check 
CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));

-- Create work_summary table
CREATE TABLE IF NOT EXISTS work_summary (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  work TEXT NOT NULL,
  handled_tasks INTEGER NOT NULL DEFAULT 0,
  month TEXT NOT NULL, -- Format: YYYY-MM (e.g., 2026-02)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, work, month) -- Prevent duplicate work entries for same user and month
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_work_summary_user_id ON work_summary(user_id);
CREATE INDEX IF NOT EXISTS idx_work_summary_month ON work_summary(month);
CREATE INDEX IF NOT EXISTS idx_work_summary_user_month ON work_summary(user_id, month);

-- Enable Row Level Security
ALTER TABLE work_summary ENABLE ROW LEVEL SECURITY;

-- RLS Policies for work_summary
-- Employees can view and manage their own work summary
CREATE POLICY "Users can view their own work summary" 
ON work_summary 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own work summary" 
ON work_summary 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own work summary" 
ON work_summary 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own work summary" 
ON work_summary 
FOR DELETE 
USING (auth.uid() = user_id);

-- Admins can view all work summaries
CREATE POLICY "Admins can view all work summaries" 
ON work_summary 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

-- Insert default work types for all existing employees for current month
INSERT INTO work_summary (user_id, work, handled_tasks, month)
SELECT 
  p.id as user_id,
  w.work_name as work,
  0 as handled_tasks,
  TO_CHAR(CURRENT_DATE, 'YYYY-MM') as month
FROM 
  profiles p
CROSS JOIN (
  VALUES 
    ('Computer Repair'),
    ('Computer Upgrade'),
    ('New Computer installation'),
    ('Head office user Support'),
    ('POS Configuration'),
    ('Mobile Device configuration'),
    ('Scan and Go'),
    ('Tabs ( HC )'),
    ('Tabs ( HRP )'),
    ('Tabs ( Backey Tab )'),
    ('Other users Support')
) AS w(work_name)
WHERE 
  p.role = 'employee'
  AND NOT EXISTS (
    SELECT 1 FROM work_summary ws 
    WHERE ws.user_id = p.id 
    AND ws.work = w.work_name 
    AND ws.month = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
  );

-- Create function to add default work types for new employees
CREATE OR REPLACE FUNCTION add_default_work_summary()
RETURNS TRIGGER AS $$
BEGIN
  -- Only add default work types for employees
  IF NEW.role = 'employee' THEN
    INSERT INTO work_summary (user_id, work, handled_tasks, month)
    VALUES 
      (NEW.id, 'Computer Repair', 0, TO_CHAR(CURRENT_DATE, 'YYYY-MM')),
      (NEW.id, 'Computer Upgrade', 0, TO_CHAR(CURRENT_DATE, 'YYYY-MM')),
      (NEW.id, 'New Computer installation', 0, TO_CHAR(CURRENT_DATE, 'YYYY-MM')),
      (NEW.id, 'Head office user Support', 0, TO_CHAR(CURRENT_DATE, 'YYYY-MM')),
      (NEW.id, 'POS Configuration', 0, TO_CHAR(CURRENT_DATE, 'YYYY-MM')),
      (NEW.id, 'Mobile Device configuration', 0, TO_CHAR(CURRENT_DATE, 'YYYY-MM')),
      (NEW.id, 'Scan and Go', 0, TO_CHAR(CURRENT_DATE, 'YYYY-MM')),
      (NEW.id, 'Tabs ( HC )', 0, TO_CHAR(CURRENT_DATE, 'YYYY-MM')),
      (NEW.id, 'Tabs ( HRP )', 0, TO_CHAR(CURRENT_DATE, 'YYYY-MM')),
      (NEW.id, 'Tabs ( Backey Tab )', 0, TO_CHAR(CURRENT_DATE, 'YYYY-MM')),
      (NEW.id, 'Other users Support', 0, TO_CHAR(CURRENT_DATE, 'YYYY-MM'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically add default work types when a new employee is created
DROP TRIGGER IF EXISTS trigger_add_default_work_summary ON profiles;
CREATE TRIGGER trigger_add_default_work_summary
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION add_default_work_summary();

-- ============================================================
-- AUTO-CHECKOUT AT 6:00 PM
-- ============================================================

-- Create function to auto-checkout employees at 6:00 PM
-- This function finds all employees who checked in but haven't checked out
-- and automatically checks them out at 6:00 PM
CREATE OR REPLACE FUNCTION auto_checkout_employees()
RETURNS TEXT AS $$
DECLARE
  today_date DATE;
  checkout_time TIMESTAMP WITH TIME ZONE;
  updated_count INTEGER;
BEGIN
  -- Get today's date
  today_date := CURRENT_DATE;
  
  -- Set checkout time to 6:00 PM today (18:00)
  checkout_time := (CURRENT_DATE + TIME '18:00:00')::TIMESTAMP WITH TIME ZONE;
  
  -- Update all attendance records where check_in exists but check_out is null
  WITH updated AS (
    UPDATE attendance
    SET check_out = checkout_time
    WHERE date = today_date
      AND check_in IS NOT NULL
      AND check_out IS NULL
    RETURNING *
  )
  SELECT COUNT(*) INTO updated_count FROM updated;
  
  -- Log the result
  RAISE NOTICE 'Auto-checkout completed: % employees checked out at 6:00 PM on %', updated_count, today_date;
  
  RETURN format('Successfully auto-checked out %s employees at 6:00 PM on %s', updated_count, today_date);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- CRON JOB SETUP (Requires pg_cron extension)
-- ============================================================
-- 
-- To enable automatic checkout at 6:00 PM every day, you need to:
-- 
-- 1. Enable pg_cron extension (if not already enabled):
--    Enable it from Supabase Dashboard > Database > Extensions
--    Or run: CREATE EXTENSION IF NOT EXISTS pg_cron;
--
-- 2. Schedule the auto-checkout function to run at 6:00 PM daily:
--
-- SELECT cron.schedule(
--   'auto-checkout-at-6pm',           -- Job name
--   '0 18 * * *',                      -- Cron schedule: Every day at 6:00 PM
--   $$ SELECT auto_checkout_employees(); $$
-- );
--
-- 3. To view all scheduled jobs:
--    SELECT * FROM cron.job;
--
-- 4. To unschedule the job (if needed):
--    SELECT cron.unschedule('auto-checkout-at-6pm');
--
-- ============================================================
-- ALTERNATIVE: Use external cron service
-- ============================================================
--
-- If pg_cron is not available, you can use an external cron service
-- (like cron-job.org, GitHub Actions, Vercel Cron, etc.) to call:
--
--   POST https://your-domain.com/api/auto-checkout
--   Authorization: Bearer YOUR_CRON_SECRET
--
-- Make sure to set CRON_SECRET in your environment variables.
-- ============================================================

-- ============================================================
-- HALF-DAY LEAVE SUPPORT
-- ============================================================

-- Add is_half_day column to leave_requests table
ALTER TABLE leave_requests 
ADD COLUMN IF NOT EXISTS is_half_day BOOLEAN DEFAULT FALSE;

-- Add half_day_period column to store morning or evening
ALTER TABLE leave_requests 
ADD COLUMN IF NOT EXISTS half_day_period TEXT CHECK (half_day_period IN ('morning', 'evening', NULL));

-- Add comment for clarity
COMMENT ON COLUMN leave_requests.is_half_day IS 'Indicates if the leave is for half day (0.5 days). Half-day leaves count as 0.5 days and deduct 0.5 from the leave balance.';
COMMENT ON COLUMN leave_requests.half_day_period IS 'For half-day leaves, indicates whether it is morning half or evening half.';
