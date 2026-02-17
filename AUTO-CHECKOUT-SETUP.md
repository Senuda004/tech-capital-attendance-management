# Auto-Checkout Feature Setup Guide

## Overview

This feature automatically checks out employees at 6:00 PM if they have checked in but forgot to check out. This ensures accurate attendance records and prevents employees from missing their checkout.

## How It Works

The system finds all attendance records for the current day where:
- `check_in` is not null (employee has checked in)
- `check_out` is null (employee hasn't checked out yet)

At 6:00 PM every day, these employees are automatically checked out with a timestamp of 18:00:00 (6:00 PM).

---

## Setup Options

You have **3 options** to implement this feature:

### Option 1: Supabase pg_cron (Recommended)

This option uses Supabase's built-in PostgreSQL cron scheduler (pg_cron extension).

#### Prerequisites
- Supabase Postgres database with pg_cron extension enabled

#### Setup Steps

1. **Enable pg_cron Extension**
   - Go to Supabase Dashboard → Database → Extensions
   - Find "pg_cron" and enable it
   - Or run in SQL Editor:
     ```sql
     CREATE EXTENSION IF NOT EXISTS pg_cron;
     ```

2. **Run the Database Migration**
   - Open Supabase SQL Editor
   - Copy and paste the contents of `database-updates.sql`
   - Execute the script (this creates the `auto_checkout_employees()` function)

3. **Schedule the Cron Job**
   ```sql
   SELECT cron.schedule(
     'auto-checkout-at-6pm',     -- Job name
     '0 18 * * *',                -- Every day at 6:00 PM (UTC)
     $$ SELECT auto_checkout_employees(); $$
   );
   ```

4. **Adjust for Your Timezone** (if needed)
   - The cron schedule runs in UTC by default
   - If you're in Sri Lanka (UTC+5:30), you need to adjust:
     ```sql
     SELECT cron.schedule(
       'auto-checkout-at-6pm',
       '30 12 * * *',            -- 12:30 PM UTC = 6:00 PM Sri Lanka Time
       $$ SELECT auto_checkout_employees(); $$
     );
     ```
   - Calculate your offset: `18:00 - your_timezone_offset`

5. **Verify the Job**
   ```sql
   -- View all cron jobs
   SELECT * FROM cron.job;
   
   -- View job run history
   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
   ```

6. **To Remove the Job** (if needed)
   ```sql
   SELECT cron.unschedule('auto-checkout-at-6pm');
   ```

---

### Option 2: External Cron Service (Vercel, cron-job.org, etc.)

Use an external service to call your API endpoint at 6:00 PM daily.

#### Setup Steps

1. **Set up the API Secret**
   - Add to your `.env.local` or environment variables:
     ```bash
     CRON_SECRET=your-super-secret-key-here
     ```
   - Generate a secure secret: `openssl rand -base64 32`

2. **Deploy Your Application**
   - Ensure the app is deployed and accessible online
   - Your API endpoint will be: `https://your-domain.com/api/auto-checkout`

3. **Choose a Cron Service**

   **Option A: Vercel Cron (if using Vercel)**
   - Create `vercel.json` in your project root:
     ```json
     {
       "crons": [{
         "path": "/api/auto-checkout",
         "schedule": "0 18 * * *"
       }]
     }
     ```

   **Option B: cron-job.org**
   - Go to https://cron-job.org
   - Create a free account
   - Create a new cron job:
     - URL: `https://your-domain.com/api/auto-checkout`
     - Schedule: `0 18 * * *` (6:00 PM daily)
     - Custom Header: `Authorization: Bearer your-super-secret-key-here`
     - Method: POST

   **Option C: GitHub Actions**
   - Create `.github/workflows/auto-checkout.yml`:
     ```yaml
     name: Auto Checkout Employees
     
     on:
       schedule:
         - cron: '0 18 * * *'  # 6:00 PM UTC daily
       workflow_dispatch:  # Allow manual trigger
     
     jobs:
       auto-checkout:
         runs-on: ubuntu-latest
         steps:
           - name: Call Auto-Checkout API
             run: |
               curl -X POST https://your-domain.com/api/auto-checkout \
                 -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
                 -H "Content-Type: application/json"
     ```
   - Add `CRON_SECRET` to GitHub Secrets (Settings → Secrets and variables → Actions)

---

### Option 3: Supabase Edge Function

Use Supabase Edge Functions with cron scheduling.

#### Setup Steps

1. **Create Edge Function**
   ```bash
   supabase functions new auto-checkout
   ```

2. **Add Function Code** (`supabase/functions/auto-checkout/index.ts`):
   ```typescript
   import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
   import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

   serve(async (req) => {
     const supabaseClient = createClient(
       Deno.env.get('SUPABASE_URL') ?? '',
       Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
     )

     const now = new Date();
     const todayYMD = now.toISOString().split('T')[0];
     const checkoutTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0).toISOString();

     const { data, error } = await supabaseClient
       .from('attendance')
       .update({ check_out: checkoutTime })
       .eq('date', todayYMD)
       .is('check_out', null)
       .not('check_in', 'is', null);

     return new Response(
       JSON.stringify({ success: !error, message: 'Auto-checkout completed' }),
       { headers: { "Content-Type": "application/json" } }
     )
   })
   ```

3. **Deploy Function**
   ```bash
   supabase functions deploy auto-checkout
   ```

4. **Schedule with pg_cron** (call the edge function):
   ```sql
   SELECT cron.schedule(
     'auto-checkout-edge-function',
     '0 18 * * *',
     $$
     SELECT net.http_post(
       url := 'https://your-project.supabase.co/functions/v1/auto-checkout',
       headers := '{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
     );
     $$
   );
   ```

---

## Testing

### Test the API Endpoint Manually

1. **GET Request** (Preview who would be checked out):
   ```bash
   curl -X GET https://your-domain.com/api/auto-checkout \
     -H "Authorization: Bearer your-secret-key"
   ```

2. **POST Request** (Actually perform checkout):
   ```bash
   curl -X POST https://your-domain.com/api/auto-checkout \
     -H "Authorization: Bearer your-secret-key"
   ```

### Test the Database Function

```sql
-- Run the function manually to test
SELECT auto_checkout_employees();
```

---

## Monitoring

### Check Cron Job Status (pg_cron)

```sql
-- View scheduled jobs
SELECT * FROM cron.job WHERE jobname = 'auto-checkout-at-6pm';

-- View last 10 runs
SELECT * FROM cron.job_run_details 
WHERE jobname = 'auto-checkout-at-6pm' 
ORDER BY start_time DESC 
LIMIT 10;
```

### Check API Logs (Vercel/Deployment Platform)

- Go to your deployment platform's dashboard
- Check function logs for `/api/auto-checkout`
- Look for success messages and error logs

---

## Troubleshooting

### Issue: Cron job not running

**Solution:**
1. Verify pg_cron is enabled: `SELECT * FROM pg_extension WHERE extname = 'pg_cron';`
2. Check job exists: `SELECT * FROM cron.job;`
3. Check for errors: `SELECT * FROM cron.job_run_details WHERE status = 'failed';`

### Issue: Wrong timezone

**Solution:**
- Adjust the cron schedule to match your local time
- Use a timezone converter: https://www.timeanddate.com/worldclock/converter.html
- Example: If you want 6:00 PM Sri Lanka Time (UTC+5:30):
  - UTC time = 6:00 PM - 5:30 = 12:30 PM UTC
  - Cron: `30 12 * * *`

### Issue: API endpoint not authorized

**Solution:**
- Verify `CRON_SECRET` is set in environment variables
- Check Authorization header is correct: `Bearer {your-secret}`
- View API logs for error details

### Issue: No employees being checked out

**Solution:**
1. Check if employees actually checked in today:
   ```sql
   SELECT * FROM attendance 
   WHERE date = CURRENT_DATE 
   AND check_in IS NOT NULL 
   AND check_out IS NULL;
   ```
2. Verify the function runs at the correct time
3. Check database logs

---

## Security Considerations

1. **API Authorization**
   - Always use `CRON_SECRET` for production
   - Use a strong, randomly generated secret
   - Never commit secrets to version control

2. **Database Function**
   - Uses `SECURITY DEFINER` to bypass RLS policies
   - Only accessible to database administrators

3. **Rate Limiting**
   - Consider adding rate limiting to the API endpoint
   - Restrict access by IP if possible

---

## Cron Schedule Reference

```
 ┌─────────── minute (0 - 59)
 │ ┌───────── hour (0 - 23)
 │ │ ┌─────── day of month (1 - 31)
 │ │ │ ┌───── month (1 - 12)
 │ │ │ │ ┌─── day of week (0 - 6) (Sunday to Saturday)
 │ │ │ │ │
 * * * * *
```

Examples:
- `0 18 * * *` - Every day at 6:00 PM
- `30 12 * * *` - Every day at 12:30 PM (UTC)
- `0 18 * * 1-5` - 6:00 PM on weekdays only
- `0 18 * * MON-FRI` - Same as above (named days)

---

## Next Steps

1. Choose your preferred setup option (1, 2, or 3)
2. Follow the setup steps for your chosen option
3. Test thoroughly before deploying to production
4. Monitor the first few days to ensure it works correctly
5. Adjust timezone if needed

For questions or issues, check the troubleshooting section or create an issue in your repository.
