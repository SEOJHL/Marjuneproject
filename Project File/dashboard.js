// Dashboard logic backed by Supabase.

(async function () {
  const session = await Auth.requireLogin();
  if (!session) return;

  const { user, profile } = session;
  const isClient = profile.role === 'client';

  const els = {
    badge:        document.getElementById('userBadge'),
    logout:       document.getElementById('logoutBtn'),
    settingsBtn:  document.getElementById('settingsBtn'),
    settingsModal:document.getElementById('settingsModal'),
    closeSettings:document.getElementById('closeSettingsBtn'),
    saveSettings: document.getElementById('saveSettingsBtn'),
    testWebhook:  document.getElementById('testWebhookBtn'),
    discordInput: document.getElementById('discordWebhook'),
    createSection:document.getElementById('createTaskSection'),
    taskForm:     document.getElementById('taskForm'),
    title:        document.getElementById('taskTitle'),
    assignee:     document.getElementById('taskAssignee'),
    projectPicker:        document.getElementById('projectPicker'),
    projectPickerTrigger: document.getElementById('projectPickerTrigger'),
    projectPickerLabel:   document.getElementById('projectPickerLabel'),
    projectPickerMenu:    document.getElementById('projectPickerMenu'),
    projectList:          document.getElementById('projectList'),
    projectCreateToggle:  document.getElementById('projectCreateToggle'),
    projectCreateForm:    document.getElementById('projectCreateForm'),
    newProjectName:       document.getElementById('newProjectName'),
    newProjectSubmit:     document.getElementById('newProjectSubmit'),
    taskProjectId:        document.getElementById('taskProjectId'),
    due:          document.getElementById('taskDue'),
    notes:        document.getElementById('taskNotes'),
    tasksList:    document.getElementById('tasksList'),
    filter:       document.getElementById('filterStatus'),
    heading:      document.getElementById('tasksHeading')
  };

  let projectsCache = [];

  // ---------- Header with login time ----------
  const roleLabel = isClient ? 'Client' : 'VA';
  const loginAt = user.last_sign_in_at ? new Date(user.last_sign_in_at) : null;
  const loginStr = loginAt
    ? `Logged in ${loginAt.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
    : '';
  els.badge.innerHTML =
    `<strong>${escapeHtml(profile.name)}</strong> · ${roleLabel}` +
    (loginStr ? ` <span class="login-time">${loginStr}</span>` : '');

  els.heading.textContent = isClient ? 'Tasks you assigned' : 'Tasks assigned to you';

  if (!isClient) {
    els.createSection.style.display = 'none';
  }

  // ---------- Logout ----------
  els.logout.addEventListener('click', async () => {
    await Auth.signOut();
    window.location.href = 'index.html';
  });

  // ---------- Settings modal ----------
  els.settingsBtn.addEventListener('click', () => {
    els.discordInput.value = Settings.get().discordWebhook || '';
    els.settingsModal.classList.remove('hidden');
  });
  els.closeSettings.addEventListener('click', () => els.settingsModal.classList.add('hidden'));
  els.saveSettings.addEventListener('click', () => {
    Settings.set({ discordWebhook: els.discordInput.value.trim() });
    els.settingsModal.classList.add('hidden');
    showToast('Settings saved');
  });
  els.testWebhook.addEventListener('click', async () => {
    Settings.set({ discordWebhook: els.discordInput.value.trim() });
    const res = await Notify.discord(`Test message from Jarhead Lab Task Hub (${profile.name})`);
    if (res.ok) showToast('Test sent ✓');
    else showToast('Failed: ' + (res.reason || 'unknown'), 'error');
  });

  // ---------- VA dropdown (client only) ----------
  async function refreshVAs() {
    if (!isClient) return;
    const vas = await VAs.list();
    els.assignee.innerHTML = '<option value="">Select a VA…</option>' +
      vas.map(v => `<option value="${v.id}">${escapeHtml(v.name)}</option>`).join('');
  }

  // ---------- Project picker (Clockify-style) ----------
  async function refreshProjects() {
    if (!isClient) return;
    projectsCache = await Projects.list();
    renderProjectList();
  }

  function renderProjectList() {
    if (!projectsCache.length) {
      els.projectList.innerHTML = `<div class="project-empty">No projects yet.</div>`;
      return;
    }
    els.projectList.innerHTML = projectsCache.map(p => `
      <button type="button" class="project-item" data-id="${p.id}">
        <span class="project-dot" style="background:${escapeHtml(p.color)}"></span>
        <span class="project-name">${escapeHtml(p.name)}</span>
      </button>
    `).join('');
    els.projectList.querySelectorAll('.project-item').forEach(btn => {
      btn.addEventListener('click', () => selectProject(btn.dataset.id));
    });
  }

  function selectProject(id) {
    const p = projectsCache.find(x => x.id === id);
    if (!p) return;
    els.taskProjectId.value = p.id;
    els.projectPickerLabel.classList.remove('project-picker-placeholder');
    els.projectPickerLabel.innerHTML =
      `<span class="project-dot" style="background:${escapeHtml(p.color)}"></span>` +
      `<span>${escapeHtml(p.name)}</span>`;
    closeProjectMenu();
  }

  function clearProjectSelection() {
    els.taskProjectId.value = '';
    els.projectPickerLabel.classList.add('project-picker-placeholder');
    els.projectPickerLabel.textContent = 'Select Project / Client…';
  }

  function openProjectMenu() {
    els.projectPickerMenu.classList.remove('hidden');
    els.projectCreateForm.classList.add('hidden');
  }
  function closeProjectMenu() {
    els.projectPickerMenu.classList.add('hidden');
    els.projectCreateForm.classList.add('hidden');
    els.newProjectName.value = '';
  }

  if (isClient) {
    els.projectPickerTrigger.addEventListener('click', () => {
      if (els.projectPickerMenu.classList.contains('hidden')) openProjectMenu();
      else closeProjectMenu();
    });

    document.addEventListener('click', (e) => {
      if (!els.projectPicker.contains(e.target)) closeProjectMenu();
    });

    els.projectCreateToggle.addEventListener('click', () => {
      els.projectCreateForm.classList.toggle('hidden');
      if (!els.projectCreateForm.classList.contains('hidden')) {
        els.newProjectName.focus();
      }
    });

    els.newProjectSubmit.addEventListener('click', addProject);
    els.newProjectName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addProject(); }
    });

    async function addProject() {
      const name = els.newProjectName.value.trim();
      if (!name) return;
      const { data, error } = await Projects.createOrGet(name, user.id);
      if (error) { showToast('Failed: ' + error.message, 'error'); return; }
      await refreshProjects();
      selectProject(data.id);
      showToast('Project added');
    }
  }

  // ---------- Create task (client only) ----------
  if (isClient) {
    els.taskForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { data: task, error } = await Tasks.create({
        title:      els.title.value.trim(),
        projectId:  els.taskProjectId.value || null,
        notes:      els.notes.value.trim(),
        due:        els.due.value,
        assigneeId: els.assignee.value,
        createdBy:  user.id
      });
      if (error) { showToast('Failed: ' + error.message, 'error'); return; }
      els.taskForm.reset();
      clearProjectSelection();
      showToast('Task assigned');
      const res = await Notify.taskAssigned(task);
      if (!res.ok && res.reason !== 'no-webhook') {
        showToast('Discord notify failed: ' + res.reason, 'error');
      }
      render();
    });
  }

  // ---------- Filtering ----------
  els.filter.addEventListener('change', render);

  // ---------- Render ----------
  async function render() {
    const all = await Tasks.listFor(profile);
    const filtered = all.filter(t => {
      const f = els.filter.value;
      if (f !== 'all' && t.status !== f) return false;
      return true;
    });

    if (filtered.length === 0) {
      els.tasksList.innerHTML = `<div class="empty">No tasks to show.</div>`;
      return;
    }

    els.tasksList.innerHTML = renderTable(filtered);
    bindRowEvents(filtered);
  }

  function renderTable(tasks) {
    const rows = tasks.map(renderRow).join('');
    return `
      <div class="table-wrap">
        <table class="tasks-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Client / Project</th>
              <th>Assignee</th>
              <th>By</th>
              <th>Due</th>
              <th>Status</th>
              <th>Start</th>
              <th>End</th>
              <th>Duration</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function renderRow(task) {
    const statusClass = `status-${task.status}`;
    const statusLabel = task.status.replace('-', ' ');
    const assigneeName = task.assignee?.name || '—';
    const creatorName  = task.creator?.name  || '—';
    const canDelete = isClient && task.created_by === user.id;

    let actions = '';
    if (!isClient && task.assignee_id === user.id) {
      if (task.status === 'pending') {
        actions += `<button class="action-btn start" data-act="start" data-id="${task.id}">Start</button>`;
      } else if (task.status === 'in-progress') {
        actions += `<button class="action-btn done" data-act="done" data-id="${task.id}">Done</button>`;
      } else {
        actions += `<span class="muted-small">Completed</span>`;
      }
    }
    if (canDelete) {
      actions += `<button class="action-btn delete-btn" data-act="delete" data-id="${task.id}">Delete</button>`;
    }
    if (!actions) actions = '<span class="muted-small">—</span>';

    return `
      <tr>
        <td>
          <div class="cell-title">${escapeHtml(task.title)}</div>
          ${task.notes ? `<div class="cell-sub">${escapeHtml(task.notes)}</div>` : ''}
        </td>
        <td>${renderProjectCell(task)}</td>
        <td>${escapeHtml(assigneeName)}</td>
        <td>${escapeHtml(creatorName)}</td>
        <td>${task.due ? escapeHtml(task.due) : '—'}</td>
        <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
        <td>${formatDateTime(task.start_time)}</td>
        <td>${formatDateTime(task.end_time)}</td>
        <td>${formatDuration(task.start_time, task.end_time) || '—'}</td>
        <td><div class="row-actions">${actions}</div></td>
      </tr>
    `;
  }

  function bindRowEvents(tasks) {
    els.tasksList.querySelectorAll('button[data-act]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const task = tasks.find(t => t.id === id);
        if (!task) return;

        if (btn.dataset.act === 'start') {
          const { data: updated, error } = await Tasks.start(id);
          if (error) { showToast('Failed: ' + error.message, 'error'); return; }
          showToast('Task started');
          // VA changed status → notify the client (creator).
          await Notify.taskUpdated(updated, task.status, updated.creator);
          render();
        } else if (btn.dataset.act === 'done') {
          const { data: updated, error } = await Tasks.complete(id);
          if (error) { showToast('Failed: ' + error.message, 'error'); return; }
          showToast('Task completed');
          await Notify.taskUpdated(updated, task.status, updated.creator);
          render();
        } else if (btn.dataset.act === 'delete') {
          if (!confirm('Delete this task?')) return;
          const { error } = await Tasks.remove(id);
          if (error) { showToast('Failed: ' + error.message, 'error'); return; }
          showToast('Task deleted');
          render();
        }
      });
    });
  }

  // ---------- Helpers ----------
  function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function renderProjectCell(task) {
    if (task.project) {
      return `<span class="project-dot" style="background:${escapeHtml(task.project.color)}"></span> ` +
             `<span>${escapeHtml(task.project.name)}</span>`;
    }
    if (task.client_project) return escapeHtml(task.client_project);
    return '—';
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ---------- Realtime ----------
  sb.channel('tasks-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => render())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => refreshProjects())
    .subscribe();

  // ---------- Initial paint ----------
  await refreshVAs();
  await refreshProjects();
  await render();
})();
