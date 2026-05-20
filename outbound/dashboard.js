// Forge Outbound Dashboard
// Stateless data from campaigns.json, ephemeral status from localStorage

const LS_KEY = "forge_outbound_state_v1";
const CAMPAIGN_ID = "warm-list-reactivation-2026-05";

let campaign = null;
let state = {}; // { sendId: { status, sent_date, notes } }
let filter = "all";

function loadState() {
  try {
    state = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch (e) {
    state = {};
  }
}
function saveState() {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

function getStatus(sendId) {
  return (state[sendId] && state[sendId].status) || "not-sent";
}
function setStatus(sendId, status) {
  state[sendId] = state[sendId] || {};
  state[sendId].status = status;
  if (status === "sent" && !state[sendId].sent_date) {
    state[sendId].sent_date = new Date().toISOString().slice(0, 10);
  }
  saveState();
  render();
}
function setNote(sendId, note) {
  state[sendId] = state[sendId] || {};
  state[sendId].notes = note;
  saveState();
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
  "not-sent": "not-sent",
  "sent": "sent",
  "replied-interested": "replied",
  "replied-no": "replied",
  "no-reply-30d": "sent",
  "booked-call": "replied",
  "closed": "closed"
};

async function init() {
  loadState();
  try {
    const r = await fetch("campaigns.json");
    const data = await r.json();
    campaign = data.campaigns.find(c => c.id === CAMPAIGN_ID) || data.campaigns[0];
  } catch (e) {
    document.body.innerHTML = '<div style="color:#FAF8F3; padding:40px;">Failed to load campaigns.json. Make sure it sits next to this index.html.</div>';
    return;
  }
  document.getElementById("campaign-title").textContent = campaign.name;
  setupTabs();
  setupModal();
  setupKeyboard();
  render();
}

function render() {
  renderStats();
  renderSends();
}

function renderStats() {
  const sends = campaign.sends;
  const total = sends.length;
  const sent = sends.filter(s => ["sent","replied-interested","replied-no","no-reply-30d","booked-call","closed"].includes(getStatus(s.id))).length;
  const replied = sends.filter(s => ["replied-interested","replied-no","booked-call","closed"].includes(getStatus(s.id))).length;
  const interested = sends.filter(s => ["replied-interested","booked-call"].includes(getStatus(s.id))).length;
  const queued = total - sent;

  const today = new Date();
  const campaignStart = new Date(campaign.started);
  const dayDiff = Math.floor((today - campaignStart) / (1000 * 60 * 60 * 24));
  const currentWeek = Math.floor(dayDiff / 7) + 1;
  const dueThisWeek = sends.filter(s => s.send_week === currentWeek && getStatus(s.id) === "not-sent").length;

  document.getElementById("stats").innerHTML = `
    <div class="stat">
      <div class="stat-value">${queued}</div>
      <div class="stat-label">Queued</div>
    </div>
    <div class="stat">
      <div class="stat-value">${sent}/${total}</div>
      <div class="stat-label">Sent</div>
    </div>
    <div class="stat">
      <div class="stat-value">${replied}</div>
      <div class="stat-label">Replies</div>
    </div>
    <div class="stat">
      <div class="stat-value">${interested}</div>
      <div class="stat-label">Interested</div>
    </div>
    <div class="stat">
      <div class="stat-value">${dueThisWeek}</div>
      <div class="stat-label">Due this week</div>
    </div>
  `;
}

function renderSends() {
  const container = document.getElementById("sends-list");
  let toShow = campaign.sends.filter(s => {
    const stat = getStatus(s.id);
    const bucket = STATUS_BUCKETS[stat] || "not-sent";
    if (filter === "all") return true;
    return bucket === filter;
  });

  // Sort by send_week then send_day
  const dayOrder = { "Mon": 1, "Tue": 2, "Wed": 3, "Thu": 4, "Fri": 5 };
  toShow.sort((a, b) => {
    if (a.send_week !== b.send_week) return a.send_week - b.send_week;
    return (dayOrder[a.send_day] || 9) - (dayOrder[b.send_day] || 9);
  });

  if (!toShow.length) {
    container.innerHTML = '<div class="empty">Nothing in this view yet.</div>';
    return;
  }

  let html = "";
  let lastWeek = null;
  for (const s of toShow) {
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
          <span class="badge week-${s.send_week}">Week ${s.send_week} · ${s.send_day}</span>
          <span class="badge channel">${escapeHtml(s.channel_primary)}</span>
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
  const send = campaign.sends.find(s => s.id === sendId);
  if (!send) return;
  const content = channel === "linkedin" ? send.linkedin_dm : send.email_body;
  if (!content) {
    toast("No content for this channel.");
    return;
  }
  copyCurrent = { sendId, channel };
  document.getElementById("copy-modal-title").textContent = `${channel === "linkedin" ? "LinkedIn DM" : "Email"} · ${send.target}`;
  document.getElementById("copy-modal-content").textContent = content;
  document.getElementById("copy-modal").hidden = false;
}
function closeCopyModal() {
  document.getElementById("copy-modal").hidden = true;
  copyCurrent = null;
}
function setupModal() {
  document.getElementById("copy-modal-close").addEventListener("click", closeCopyModal);
  document.getElementById("copy-modal-copy").addEventListener("click", () => {
    const c = document.getElementById("copy-modal-content").textContent;
    navigator.clipboard.writeText(c).then(() => {
      toast("Copied. Paste into " + (copyCurrent.channel === "linkedin" ? "LinkedIn." : "your email client."));
    });
  });
  document.getElementById("copy-modal-mark-sent").addEventListener("click", () => {
    if (copyCurrent) setStatus(copyCurrent.sendId, "sent");
    closeCopyModal();
  });
  document.getElementById("copy-modal").addEventListener("click", (e) => {
    if (e.target.id === "copy-modal") closeCopyModal();
  });
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach(t => {
    t.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
      t.classList.add("active");
      filter = t.dataset.filter;
      render();
    });
  });
}

function setupKeyboard() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeCopyModal();
  });
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1800);
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

init();
