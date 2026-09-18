# Marjuneproject
# Jarhead Lab Task Hub — Supabase Setup

One-time setup to wire the app to a real backend. Should take ~10 minutes.

## 1. Create a Supabase project

1. Go to https://supabase.com and sign in (free tier is fine).
2. Click **New project**, pick a name, set a database password, choose a region close to you.
3. Wait ~1 minute for the project to provision.

## 2. Run the schema

1. In the Supabase dashboard, open **SQL Editor** (left sidebar).
2. Click **New query**, paste the entire contents of `supabase-schema.sql`, run it.
3. You should see "Success. No rows returned." — that means tables, policies, and triggers were created.

### If you already ran an older schema

Run any migrations you haven't yet, in order. All are safe to re-run.

- `supabase-migration-002.sql` — adds `client_project`, `start_time`, `end_time`.
- `supabase-migration-003.sql` — adds `email` to profiles (needed for email notifications).
- `supabase-migration-004.sql` — adds the **projects** table, links tasks via `project_id`, and migrates any existing `client_project` text values into proper project rows.

## 3. (Recommended) Disable email confirmation for local testing

By default, signups require a confirmation email click before login works. For testing, turn this off:

1. **Authentication → Sign In / Providers → Email** in the dashboard.
2. Toggle **Confirm email** OFF.
3. Click **Save**.

(Leave it ON for production.)

## 4. Paste your keys into config.js

1. In the Supabase dashboard, open **Project Settings → API**.
2. Copy **Project URL** and **anon public** key.
3. Open `config.js` in this folder and replace the placeholder values:

```js
window.SUPABASE_URL      = 'https://abcd1234.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOi…';
```

The anon key is safe to ship to the browser — Row Level Security on your tables enforces access control.

## 5. Open the app

Open `index.html` in your browser (or the preview panel). You should see Sign In / Sign Up tabs.

### First test run

1. Sign up as a **VA** (e.g. "Bob", `bob@test.com`).
2. Sign out, sign up as a **Client** (e.g. "Alice", `alice@test.com`).
3. As Alice, assign a task to Bob (the dropdown will list Bob).
4. Sign out, sign back in as Bob — you'll see the task. Change its status.
5. (Optional) Open Settings → paste a Discord webhook URL → "Send test" to verify webhooks.

If you open Alice's dashboard in one browser tab and Bob's in another, status changes appear in realtime without refresh.

## 6. Gmail email notifications

The app calls a Supabase Edge Function that uses Gmail SMTP to email the recipient on task-assigned and status-change events.

### 6a. Generate a Gmail app password

1. Sign in to the Google account you want emails to be sent **from**.
2. Make sure 2-Step Verification is enabled: https://myaccount.google.com/security
3. Open https://myaccount.google.com/apppasswords → create an app password named "Task Hub" → copy the 16-character code.

### 6b. Set Edge Function secrets

In Supabase dashboard → **Project Settings → Edge Functions → Secrets** (or **Project Settings → Functions → Secrets**), add:

- `GMAIL_USER` — your full gmail address (e.g. `you@gmail.com`)
- `GMAIL_APP_PASSWORD` — the 16-char app password (no spaces)

### 6c. Deploy the Edge Function

Easiest path (no CLI install required):

1. In Supabase dashboard → **Edge Functions** → **Deploy a new function**.
2. Name it exactly: `send-task-email` (must match — the frontend calls this name).
3. Paste the entire contents of `supabase/functions/send-task-email/index.ts`.
4. Click **Deploy**.

(Alternative: install the Supabase CLI and run `supabase functions deploy send-task-email`.)

### 6d. Run migration 003 (adds email to profiles)

In SQL Editor, paste and run `supabase-migration-003.sql`. This adds the `email` column to `profiles` so the frontend knows where to send notifications, and backfills existing users from `auth.users`.

After this, refresh your dashboard tab. Assign a task — the assignee should receive an email.

## 7. Password reset & email confirmation

### 7a. Add the reset-password redirect URL

When a user clicks the password-reset link in their email, Supabase needs to know which URL to send them to.

1. Supabase dashboard → **Authentication → URL Configuration**.
2. Under **Redirect URLs**, add the full URL where `reset-password.html` is served, for example:
   - `http://localhost:5500/reset-password.html` (if using Live Server)
   - `https://your-deployed-domain.com/reset-password.html`
3. Save.

### 7b. Configure Auth SMTP (recommended)

By default Supabase sends auth emails (confirmation, reset) through its shared sender, which is rate limited (~3 / hour). Plug your Gmail in so it uses the same credentials as task notifications:

1. **Authentication → Email Templates → SMTP Settings** (or **Project Settings → Auth → SMTP**).
2. Toggle on **Enable Custom SMTP**.
3. Host: `smtp.gmail.com`, Port: `465`, Username: your gmail, Password: your app password.
4. Sender email: your gmail. Sender name: `Jarhead Lab Task Hub`.
5. Save.

### 7c. Re-enable email confirmation

If you previously turned **Confirm email** OFF for testing, turn it back ON:
**Authentication → Sign In / Providers → Email → Confirm email** → ON.

New signups will now receive a confirmation email and must click the link before signing in.

### 7d. How to test

- **Password reset**: on the sign-in page, click "Forgot password?" → enter your email → check inbox → click link → land on `reset-password.html` → enter new password.
- **Email confirmation**: sign up with a fresh email → check inbox → click confirm link → sign in.

## 8. What's still optional

- **Per-user notification preferences** — the Discord webhook is stored per device in localStorage; could move to a `profiles` column so it follows the user.
- **Notify both parties on status change** — currently a VA's status change emails only the client. Easy to extend.

## Troubleshooting

- **"Invalid login credentials"** — make sure email confirmation is disabled (step 3), or click the confirmation link in your email.
- **VA dropdown is empty** — make sure at least one VA account exists.
- **Tasks don't appear after creating them** — check the browser console. Most likely RLS denied the query because `created_by` didn't match `auth.uid()` (this shouldn't happen with the included code, but check if you've modified `Tasks.create`).
- **"config.js is not filled in" in console** — you forgot step 4.
