// Shared utilities backed by Supabase. Loaded on every page.

if (!window.SUPABASE_URL || window.SUPABASE_URL.includes('YOUR-PROJECT')) {
  console.error('config.js is not filled in. Open config.js and paste your Supabase URL + anon key.');
}

const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
window.sb = sb;

// Settings (Discord webhook) — kept in localStorage; per-device is fine.
const Settings = {
  get() {
    try { return JSON.parse(localStorage.getItem('settings')) || { discordWebhook: '' }; }
    catch { return { discordWebhook: '' }; }
  },
  set(updates) {
    const merged = { ...this.get(), ...updates };
    localStorage.setItem('settings', JSON.stringify(merged));
    return merged;
  }
};

const Auth = {
  async signUp({ email, password, role, name }) {
    return sb.auth.signUp({
      email,
      password,
      options: { data: { role, name } }
    });
  },
  async signIn({ email, password }) {
    return sb.auth.signInWithPassword({ email, password });
  },
  async signOut() {
    return sb.auth.signOut();
  },
  async requestPasswordReset(email) {
    const redirectTo = window.location.origin
      + window.location.pathname.replace(/[^/]*$/, '')
      + 'reset-password.html';
    return sb.auth.resetPasswordForEmail(email, { redirectTo });
  },
  async currentUser() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    const { data: profile, error } = await sb
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (error) {
      console.error('Failed to load profile', error);
      return { user, profile: null };
    }
    return { user, profile };
  },
  async requireLogin() {
    const u = await this.currentUser();
    if (!u || !u.profile) {
      window.location.href = 'index.html';
      return null;
    }
    return u;
  }
};

const TASK_SELECT = '*, assignee:profiles!assignee_id(id, name, email), creator:profiles!created_by(id, name, email), project:projects!project_id(id, name, color)';

const PROJECT_COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444',
  '#06b6d4', '#a855f7', '#ec4899', '#84cc16'
];

function pickProjectColor(name) {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PROJECT_COLORS[h % PROJECT_COLORS.length];
}

const Tasks = {
  async listFor(profile) {
    // RLS already filters; the .or() is just to keep things explicit.
    const { data, error } = await sb
      .from('tasks')
      .select(TASK_SELECT)
      .order('created_at', { ascending: false });
    if (error) { console.error(error); return []; }
    return data || [];
  },
  async create({ title, projectId, notes, due, assigneeId, createdBy }) {
    return sb
      .from('tasks')
      .insert({
        title,
        project_id: projectId || null,
        notes: notes || null,
        due: due || null,
        assignee_id: assigneeId,
        created_by: createdBy
      })
      .select(TASK_SELECT)
      .single();
  },
  async updateStatus(id, status) {
    return sb
      .from('tasks')
      .update({ status })
      .eq('id', id)
      .select(TASK_SELECT)
      .single();
  },
  // VA actions: start records start_time, complete records end_time.
  async start(id) {
    return sb
      .from('tasks')
      .update({ status: 'in-progress', start_time: new Date().toISOString() })
      .eq('id', id)
      .select(TASK_SELECT)
      .single();
  },
  async complete(id) {
    return sb
      .from('tasks')
      .update({ status: 'done', end_time: new Date().toISOString() })
      .eq('id', id)
      .select(TASK_SELECT)
      .single();
  },
  async remove(id) {
    return sb.from('tasks').delete().eq('id', id);
  }
};

const VAs = {
  async list() {
    const { data, error } = await sb
      .from('profiles')
      .select('id, name')
      .eq('role', 'va')
      .order('name');
    if (error) { console.error(error); return []; }
    return data || [];
  }
};

const Projects = {
  async list() {
    const { data, error } = await sb
      .from('projects')
      .select('id, name, color, created_by')
      .order('name');
    if (error) { console.error(error); return []; }
    return data || [];
  },
  // Auto-save: try insert, fall back to fetching the existing row on conflict.
  async createOrGet(name, createdBy) {
    const trimmed = name.trim();
    if (!trimmed) return { data: null, error: new Error('Name is required') };
    const color = pickProjectColor(trimmed);

    const { data, error } = await sb
      .from('projects')
      .insert({ name: trimmed, color, created_by: createdBy })
      .select('id, name, color, created_by')
      .single();

    if (!error) return { data, error: null };

    // Unique violation → return the existing project.
    if (error.code === '23505') {
      const { data: existing, error: fetchErr } = await sb
        .from('projects')
        .select('id, name, color, created_by')
        .eq('created_by', createdBy)
        .ilike('name', trimmed)
        .maybeSingle();
      if (fetchErr) return { data: null, error: fetchErr };
      return { data: existing, error: null };
    }
    return { data: null, error };
  }
};

function formatDuration(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const ms = new Date(endIso) - new Date(startIso);
  if (ms < 0) return null;
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const Notify = {
  async discord(content) {
    const { discordWebhook } = Settings.get();
    if (!discordWebhook) return { ok: false, reason: 'no-webhook' };
    try {
      const res = await fetch(discordWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      if (!res.ok) return { ok: false, reason: 'http-' + res.status };
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: 'network', error: err.message };
    }
  },

  // Calls the send-task-email Edge Function. Fails silently if function isn't deployed.
  async email({ to, subject, html }) {
    if (!to) return { ok: false, reason: 'no-recipient' };
    try {
      const { data, error } = await sb.functions.invoke('send-task-email', {
        body: { to, subject, html }
      });
      if (error) return { ok: false, reason: error.message };
      if (data && data.error) return { ok: false, reason: data.error };
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: 'invoke-failed', error: err.message };
    }
  },

  // ---- Combined channels: fire Discord + Email together ----
  async taskAssigned(task) {
    const projectName = task.project?.name || task.client_project || null;

    const discordMsg =
      `**New task assigned** to **${task.assignee?.name || 'unknown'}**\n` +
      `• Title: ${task.title}\n` +
      (projectName ? `• Client / Project: ${projectName}\n` : '') +
      (task.due    ? `• Due: ${task.due}\n`                 : '') +
      (task.notes  ? `• Notes: ${task.notes}\n`             : '') +
      `• Assigned by: ${task.creator?.name || 'unknown'}\n` +
      `• Status: ${task.status}`;

    const html = `
      <h2 style="margin:0 0 12px;font-family:sans-serif;">New task assigned</h2>
      <p style="font-family:sans-serif;color:#333;">
        Hi ${escapeText(task.assignee?.name)}, you have a new task in Jarhead Lab Task Hub.
      </p>
      ${kvBlock([
        ['Title',            task.title],
        ['Client / Project', projectName],
        ['Due',              task.due],
        ['Notes',            task.notes],
        ['Assigned by',      task.creator?.name],
        ['Status',           task.status]
      ])}
      <p style="font-family:sans-serif;color:#666;font-size:13px;margin-top:18px;">
        Sign in to your dashboard to start the task.
      </p>
    `;

    const [discord, email] = await Promise.all([
      this.discord(discordMsg),
      this.email({
        to: task.assignee?.email,
        subject: `New task assigned: ${task.title}`,
        html
      })
    ]);
    return { discord, email };
  },

  async taskUpdated(task, oldStatus, recipient) {
    const projectName = task.project?.name || task.client_project || null;
    const dur = formatDuration(task.start_time, task.end_time);

    const discordMsg =
      `**Task status updated**\n` +
      `• Title: ${task.title}\n` +
      (projectName ? `• Client / Project: ${projectName}\n` : '') +
      `• Assignee: ${task.assignee?.name || 'unknown'}\n` +
      `• Status: ${oldStatus} → **${task.status}**` +
      (task.start_time ? `\n• Start: ${new Date(task.start_time).toLocaleString()}` : '') +
      (task.end_time   ? `\n• End: ${new Date(task.end_time).toLocaleString()}`   : '') +
      (dur             ? `\n• Duration: ${dur}` : '');

    const rows = [
      ['Title',            task.title],
      ['Client / Project', projectName],
      ['Assignee',         task.assignee?.name],
      ['Status',           `${oldStatus} → ${task.status}`]
    ];
    if (task.start_time) rows.push(['Start',    new Date(task.start_time).toLocaleString()]);
    if (task.end_time)   rows.push(['End',      new Date(task.end_time).toLocaleString()]);
    if (dur)             rows.push(['Duration', dur]);

    const html = `
      <h2 style="margin:0 0 12px;font-family:sans-serif;">Task status updated</h2>
      ${kvBlock(rows)}
    `;

    const [discord, email] = await Promise.all([
      this.discord(discordMsg),
      this.email({
        to: recipient?.email,
        subject: `Task ${task.status}: ${task.title}`,
        html
      })
    ]);
    return { discord, email };
  }
};

function kvBlock(rows) {
  return `
    <table style="font-family:sans-serif;border-collapse:collapse;margin-top:8px;">
      ${rows
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `
          <tr>
            <td style="padding:6px 12px 6px 0;color:#666;font-size:13px;vertical-align:top;">${escapeText(k)}</td>
            <td style="padding:6px 0;color:#111;font-size:13px;">${escapeText(v)}</td>
          </tr>
        `).join('')}
    </table>
  `;
}

function escapeText(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(message, kind = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}
