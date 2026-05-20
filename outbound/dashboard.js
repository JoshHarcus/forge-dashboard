// Forge Outbound Dashboard v2 — multi-campaign, segment-filterable, scaled for 100+ sends

const LS_KEY = "forge_outbound_state_v2";
let campaignsData = null;
let state = {}; // { sendId: { status, sent_date, notes } }
let activeCampaignId = "all";
let statusFilter = "all";
let subVerticalFilter = "all";

function loadState() {
  try { state = JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { state = {}; }
}
function saveState() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }

function getStatus(sendId) { return (state[sendId] && state[sendId].status) || "not-sent"; }
function setStatus(sendId, status) {
  state[sendId] = state[sendId] || {};
  state[sendId].status = status;
  if (status === "sent" && !state[sendId].sent_date) state[sendId].sent_date = new Date().toISOString().slice(0,10);
  saveState(); render();
}
function setNote(sendId, note) {
  state[sendId] = state[sendId] || {};
  state[sendId].notes = note; saveState();
}

const STATUS_LABELS = {
  "not-sent": "Not sent",
  "sent": "Sent",
  "replied-interested": "Replied (interested)",
  "replied-no": "Replied (no)",
  "no-reply-30d": "No reply 30d",
  "booked-call": "Booked call",
  "closed": "Closed"
};
const STATUS_BUCKETS = {
  "not-sent": "not-sent", "sent": "sent",
  "replied-interested": "replied", "replied-no": "replied",
  "no-reply-30d": "sent", "booked-call": "replied", "closed": "closed"
};

async function init() {
  loadState();
  try {
    const r = await fetch("campaigns.json");
    campaignsData = await r.json();
  } catch {
    document.body.innerHTML = '<div style="color:#FAF8F3;padding:40px;">Failed to load campaigns.json.</div>'; return;
  }
  setupCampaignSelector();
  setupTabs();
  setupModal();
  setupKeyboard();
  setupExport();
  render();
}

function allSends() {
  return campaignsData.campaigns.flatMap(c => c.sends.map(s => ({ ...s, _campaign_id: c.id, _campaign_name: c.name, _segment: c.segment })));
}
function currentCampaign() {
  if (activeCampaignId === "all") return null;
  return campaignsData.campaigns.find(c => c.id === activeCampaignId);
}
function currentSends() {
  if (activeCampaignId === "all") return allSends();
  const c = currentCampaign();
  return c ? c.sends.map(s => ({ ...s, _campaign_id: c.id, _campaign_name: c.name, _segment: c.segment })) : [];
}

function setupCampaignSelector() {
  const sel = document.getElementById("campaign-select");
  sel.innerHTML = `<option value="all">All campaigns (${allSends().length} sends)</option>` +
    campaignsData.campaigns.map(c => `<option value="${c.id}">${escapeHtml(c.name)} (${c.sends.length})</option>`).join("");
  sel.addEventListener("change", () => { activeCampaignId = sel.value; render(); });
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    statusFilter = t.dataset.filter;
    render();
  }));
}

function render() {
  renderStats();
  renderCampaignDescription();
  renderSubVerticalFilter();
  renderSends();
}

function renderStats() {
  const sends = currentSends();
  const total = sends.length;
  const sentBucketStatuses = ["sent","replied-interested","replied-no","no-reply-30d","booked-call","closed"];
  const sent = sends.filter(s => sentBucketStatuses.includes(getStatus(s.id))).length;
  const replied = sends.filter(s => ["replied-interested","replied-no","booked-call","closed"].includes(getStatus(s.id))).length;
  const interested = sends.filter(s => ["replied-interested","booked-call"].includes(getStatus(s.id))).length;
  const queued = total - sent;

  const today = new Date();
  const c = currentCampaign();
  let dueThisWeek = 0;
  let currentWeek = null;
  if (c && c.started) {
    const start = new Date(c.started);
    const day = Math.floor((today - start) / 86400000);
    currentWeek = Math.floor(day / 7) + 1;
    dueThisWeek = sends.filter(s => s.send_week === currentWeek && getStatus(s.id) === "not-sent").length;
  } else {
    // Aggregate across all campaigns
    dueThisWeek = sends.filter(s => getStatus(s.id) === "not-sent" && s.send_week <= 2).length;
  }

  document.getElementById("stats").innerHTML = `
    <div class="stat"><div class="stat-value">${queued}</div><div class="stat-label">Queued</div></div>
    <div class="stat"><div class="stat-value">${sent}/${total}</div><div class="stat-label">Sent</div></div>
    <div class="stat"><div class="stat-value">${replied}</div><div class="stat-label">Replies</div></div>
    <div class="stat"><div class="stat-value">${interested}</div><div class="stat-label">Interested</div></div>
    <div class="stat"><div class="stat-value">${dueThisWeek}</div><div class="stat-label">${currentWeek ? "Due wk " + currentWeek : "Next up"}</div></div>
  `;
}

function renderCampaignDescription() {
  const c = currentCampaign();
  const el = document.getElementById("campaign-description");
  if (!c) {
    el.innerHTML = `<div class="campaign-desc-inner"><strong>All campaigns</strong> · ${campaignsData.campaigns.length} active. Switch via the dropdown above to focus on one.</div>`;
    return;
  }
  el.innerHTML = `<div class="campaign-desc-inner"><strong>${escapeHtml(c.name)}</strong>
    <div class="campaign-meta">
      <span>Segment: ${escapeHtml(c.segment || "—")}</span>
      <span>Owner: ${escapeHtml(c.owner || "—")}</span>
      <span>Cadence: ${escapeHtml(c.volume_per_week || "—")}/week</span>
      <span>Status: ${escapeHtml(c.status || "—")}</span>
    </div>
    <div class="campaign-narrative">${escapeHtml(c.description || "")}</div>
  </div>`;
}

function renderSubVerticalFilter() {
  const sends = currentSends();
  const subs = [...new Set(sends.map(s => s.sub_vertical).filter(Boolean))];
  const el = document.getElementById("sub-vertical-filter");
  if (!subs.length) { el.innerHTML = ""; return; }
  el.innerHTML = `<span class="muted" style="font-size:11px;">Sub-vertical:</span> ` +
    `<button class="sub-pill ${subVerticalFilter === "all" ? "active" : ""}" data-sv="all">All</button>` +
    subs.map(sv => `<button class="sub-pill ${subVerticalFilter === sv ? "active" : ""}" data-sv="${escapeHtml(sv)}">${escapeHtml(sv)}</button>`).join("");
  el.querySelectorAll(".sub-pill").forEach(b => b.addEventListener("click", () => {
    subVerticalFilter = b.dataset.sv;
    render();
  }));
}

function renderSends() {
  const container = document.getElementById("sends-list");
  let sends = currentSends();
  if (subVerticalFilter !== "all") sends = sends.filter(s => s.sub_vertical === subVerticalFilter);

  sends = sends.filter(s => {
    const stat = getStatus(s.id);
    const bucket = STATUS_BUCKETS[stat] || "not-sent";
    if (statusFilter === "all") return true;
    return bucket === statusFilter;
  });

  const dayOrder = { "Mon": 1, "Tue": 2, "Wed": 3, "Thu": 4, "Fri": 5 };
  sends.sort((a, b) => {
    if (a._campaign_id !== b._campaign_id && activeCampaignId === "all") {
      return a._campaign_id.localeCompare(b._campaign_id);
    }
    if (a.send_week !== b.send_week) return a.send_week - b.send_week;
    return (dayOrder[a.send_day] || 9) - (dayOrder[b.send_day] || 9);
  });

  if (!sends.length) { container.innerHTML = '<div class="empty">Nothing in this view.</div>'; return; }

  let html = "";
  let lastCampaign = null;
  let lastWeek = null;

  for (const s of sends) {
    if (activeCampaignId === "all" && s._campaign_id !== lastCampaign) {
      html += `<div class="campaign-divider">${escapeHtml(s._campaign_name)}</div>`;
      lastCampaign = s._campaign_id;
      lastWeek = null;
    }
    if (s.send_week !== lastWeek) {
      html += `<div class="weekly-divider">Week ${s.send_week}</div>`;
      lastWeek = s.send_week;
    }
    html += renderCard(s);
  }
  container.innerHTML = html;
  wireCardActions();
}

function renderCard(s) {
  const stat = getStatus(s.id);
  const bucket = STATUS_BUCKETS[stat] || "not-sent";
  const sentDate = state[s.id] && state[s.id].sent_date;
  const note = (state[s.id] && state[s.id].notes) || "";

  return `
    <div class="send-card ${bucket === "sent" ? "completed" : ""} ${bucket}" data-id="${s.id}">
      <div class="send-header">
        <div class="send-target">
          ${escapeHtml(s.target)}
          <span class="send-company">· ${escapeHtml(s.company)}</span>
        </div>
        <div class="badges">
          <span class="badge week-${Math.min(s.send_week, 4)}">Wk ${s.send_week} · ${s.send_day}</span>
          <span class="badge channel">${escapeHtml(s.channel_primary)}</span>
          ${s.sub_vertical ? `<span class="badge">${escapeHtml(s.sub_vertical)}</span>` : ""}
          ${sentDate ? `<span class="badge">Sent ${sentDate}</span>` : ""}
        </div>
      </div>
      <div class="send-hook">${escapeHtml(s.hook)}</div>
      <div class="actions">
        ${s.linkedin_dm ? `<button class="btn" data-act="copy-linkedin" data-id="${s.id}">📋 LinkedIn DM</button>` : ""}
        ${s.email_body ? `<button class="btn" data-act="copy-email" data-id="${s.id}">📧 Email</button>` : ""}
        <select class="status-select" data-act="status" data-id="${s.id}">
          ${Object.entries(STATUS_LABELS).map(([k, v]) => `<option value="${k}" ${stat === k ? "selected" : ""}>${v}</option>`).join("")}
        </select>
        <button class="btn compact" data-act="notes" data-id="${s.id}">Notes</button>
      </div>
      <div class="notes ${note ? "show" : ""}" data-notes-id="${s.id}">
        <textarea placeholder="Reply notes, next steps, dates..." data-act="note" data-id="${s.id}">${escapeHtml(note)}</textarea>
      </div>
    </div>
  `;
}

function wireCardActions() {
  document.querySelectorAll('[data-act="copy-linkedin"]').forEach(b => b.addEventListener("click", () => openCopyModal(b.dataset.id, "linkedin")));
  document.querySelectorAll('[data-act="copy-email"]').forEach(b => b.addEventListener("click", () => openCopyModal(b.dataset.id, "email")));
  document.querySelectorAll('[data-act="status"]').forEach(s => s.addEventListener("change", (e) => setStatus(s.dataset.id, e.target.value)));
  document.querySelectorAll('[data-act="notes"]').forEach(b => b.addEventListener("click", () => {
    const el = document.querySelector(`[data-notes-id="${b.dataset.id}"]`);
    if (el) el.classList.toggle("show");
  }));
  document.querySelectorAll('[data-act="note"]').forEach(t => t.addEventListener("input", () => setNote(t.dataset.id, t.value)));
}

let copyCurrent = null;
function openCopyModal(sendId, channel) {
  const send = currentSends().find(s => s.id === sendId) || allSends().find(s => s.id === sendId);
  if (!send) return;
  const content = channel === "linkedin" ? send.linkedin_dm : send.email_body;
  if (!content) { toast("No content for this channel."); return; }
  copyCurrent = { sendId, channel };
  document.getElementById("copy-modal-title").textContent = `${channel === "linkedin" ? "LinkedIn DM" : "Email"} · ${send.target}`;
  document.getElementById("copy-modal-content").textContent = content;
  document.getElementById("copy-modal").hidden = false;
}
function closeCopyModal() { document.getElementById("copy-modal").hidden = true; copyCurrent = null; }
function setupModal() {
  document.getElementById("copy-modal-close").addEventListener("click", closeCopyModal);
  document.getElementById("copy-modal-copy").addEventListener("click", () => {
    const c = document.getElementById("copy-modal-content").textContent;
    navigator.clipboard.writeText(c).then(() => toast("Copied. Paste into " + (copyCurrent.channel === "linkedin" ? "LinkedIn." : "your email client.")));
  });
  document.getElementById("copy-modal-mark-sent").addEventListener("click", () => {
    if (copyCurrent) setStatus(copyCurrent.sendId, "sent");
    closeCopyModal();
  });
  document.getElementById("copy-modal").addEventListener("click", (e) => { if (e.target.id === "copy-modal") closeCopyModal(); });
}

function setupKeyboard() {
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeCopyModal(); });
}

function setupExport() {
  document.getElementById("export-btn").addEventListener("click", () => {
    const sends = currentSends();
    const rows = [["campaign_id","send_id","target","company","status","sent_date","notes","channel","week","day","sub_vertical"]];
    for (const s of sends) {
      const st = state[s.id] || {};
      rows.push([
        s._campaign_id, s.id, s.target, s.company,
        STATUS_LABELS[getStatus(s.id)] || "Not sent",
        st.sent_date || "",
        (st.notes || "").replace(/[\n\r,]+/g, " "),
        s.channel_primary, s.send_week, s.send_day, s.sub_vertical || ""
      ]);
    }
    const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `forge-outbound-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast("Exported CSV.");
  });
  document.getElementById("export-state-btn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `forge-outbound-state-${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    toast("Exported state JSON.");
  });
  document.getElementById("import-state-btn").addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "application/json";
    input.addEventListener("change", async (e) => {
      const file = e.target.files[0]; if (!file) return;
      const text = await file.text();
      try {
        const imported = JSON.parse(text);
        state = { ...state, ...imported };
        saveState();
        render();
        toast("State imported.");
      } catch { toast("Invalid JSON."); }
    });
    input.click();
  });
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

init();
