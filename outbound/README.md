# Forge Outbound

Glanceable execution dashboard for outbound campaigns. Lives at `forge-dashboard/outbound/`. Hosted on GitHub Pages.

## Usage

Open `https://joshharcus.github.io/forge-dashboard/outbound/` (no password gate currently; can add one).

Daily ritual:
1. Open the page on phone or desktop
2. Look at "Due this week" stat
3. Click any queued card
4. Click "LinkedIn DM" or "Email" button
5. Modal opens with the full message
6. Click "Copy to clipboard"
7. Paste into LinkedIn / your email client
8. Click "Mark as sent" in the modal (or change the status dropdown after closing)
9. When a reply comes back, change the status to match

State persists in localStorage on the device you use. If you want it durable across devices, snapshot the localStorage as a JSON download (TODO: add export button).

## Data
- `campaigns.json` — campaign data (sends, copy, schedule). Edit this to add new campaigns or update sends.
- `index.html` — the dashboard UI
- `dashboard.js` — client-side logic
- localStorage key `forge_outbound_state_v1` — per-device state (status, notes per send)

## Adding a new campaign

Edit `campaigns.json`, add a new entry to the `campaigns` array following the schema. Change `CAMPAIGN_ID` in `dashboard.js` if you want it as the default view, OR extend the dashboard to render multiple campaigns side-by-side.

## Schema (per send)

```json
{
  "id": "kebab-case-unique-id",
  "target": "Person or role name",
  "company": "Company",
  "first_name": "First name or [fill in]",
  "channel_primary": "LinkedIn DM | Email | Slack DM",
  "channel_fallback": "Backup channel",
  "send_week": 1,
  "send_day": "Mon",
  "subject": "Email subject",
  "hook": "One-sentence why",
  "expected_outcome": "What success looks like",
  "linkedin_dm": "Full LinkedIn message",
  "email_body": "Full email including Subject: line"
}
```

## Privacy

This dashboard is currently public-readable on gh-pages (the URL is unguessable but not authenticated). The campaign content contains client names, dollar figures, internal strategy. Two options:

1. **Accept the risk**: gh-pages is unindexed and the URL is not advertised. Reasonable for early use.
2. **Add password gate**: copy the gate from cockpit/index.html, drop into outbound/index.html, password-gate the whole page (same as cockpit's 1835 gate or different).
3. **Keep the data file out of public**: move `campaigns.json` into the private `brain/` folder (which is gitignored) and rebuild it client-side from a different source. Most complex.

For now: option 1 by default. Add option 2 when convenient.

## Related

- `~/code/forge-dashboard/cockpit/` — the brain graph view (knowledge)
- `~/code/forge-dashboard/outbound/` — this dashboard (action)
- `~/code/josh-identity/.claude/skills/brain-search/` — brain-search skill (retrieval)
- `~/code/josh-identity/MEMORY.md` — agent entry point

The pattern: brain (cockpit) is for browsing knowledge. Outbound is for executing actions on it. Brain-search is for retrieving from anywhere.

## What's next (future enhancements)

- [ ] Add export-to-CSV for HubSpot bulk update of contacts
- [ ] Add a localStorage backup/restore button
- [ ] Add Cloudflare Worker to sync state across devices (when needed)
- [ ] Add support for multiple campaigns in the same view
- [ ] Add an "import contacts from HubSpot" step so first_name + email auto-populate
- [ ] Add reply-time tracking (auto-flag overdue follow-ups)
- [ ] Add email-template preview with personalization tokens rendered
- [ ] Add password gate (copy from cockpit)
