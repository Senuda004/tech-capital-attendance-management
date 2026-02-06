-- Add leave balance columns to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS sick_leave_balance INTEGER DEFAULT 7,
ADD COLUMN IF NOT EXISTS casual_leave_balance INTEGER DEFAULT 14;

-- Add leave_type column to leave_requests table
ALTER TABLE leave_requests 
ADD COLUMN IF NOT EXISTS leave_type TEXT CHECK (leave_type IN ('annual', 'casual')) DEFAULT 'annual';

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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_work_summary_user_id ON work_summary(user_id);

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

-- Insert default work types for all existing employees
INSERT INTO work_summary (user_id, work, handled_tasks)
SELECT 
  p.id as user_id,
  w.work_name as work,
  0 as handled_tasks
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
    WHERE ws.user_id = p.id AND ws.work = w.work_name
  );

-- Create function to add default work types for new employees
CREATE OR REPLACE FUNCTION add_default_work_summary()
RETURNS TRIGGER AS $$
BEGIN
  -- Only add default work types for employees
  IF NEW.role = 'employee' THEN
    INSERT INTO work_summary (user_id, work, handled_tasks)
    VALUES 
      (NEW.id, 'Computer Repair', 0),
      (NEW.id, 'Computer Upgrade', 0),
      (NEW.id, 'New Computer installation', 0),
      (NEW.id, 'Head office user Support', 0),
      (NEW.id, 'POS Configuration', 0),
      (NEW.id, 'Mobile Device configuration', 0),
      (NEW.id, 'Scan and Go', 0),
      (NEW.id, 'Tabs ( HC )', 0),
      (NEW.id, 'Tabs ( HRP )', 0),
      (NEW.id, 'Tabs ( Backey Tab )', 0),
      (NEW.id, 'Other users Support', 0);
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

