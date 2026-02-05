-- Add leave balance columns to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS sick_leave_balance INTEGER DEFAULT 7,
ADD COLUMN IF NOT EXISTS casual_leave_balance INTEGER DEFAULT 14;

-- Add leave_type column to leave_requests table
ALTER TABLE leave_requests 
ADD COLUMN IF NOT EXISTS leave_type TEXT CHECK (leave_type IN ('annual', 'casual')) DEFAULT 'annual';

-- Set default values for existing employees (if any)
UPDATE profiles 
SET sick_leave_balance = 7, casual_leave_balance = 14 
WHERE sick_leave_balance IS NULL OR casual_leave_balance IS NULL;

-- Set default leave_type for existing leave requests
UPDATE leave_requests 
SET leave_type = 'annual' 
WHERE leave_type IS NULL;
