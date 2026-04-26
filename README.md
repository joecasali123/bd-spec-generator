# BD Spec Generator (Local Tracker)

Lightweight local BD spec generator + tracker for manually uploaded LinkedIn screenshots.

## Core capabilities
- Drag-and-drop LinkedIn screenshot upload (or click to upload).
- OpenAI vision extraction (manual screenshot upload only).
- Spec generation with:
  - Main spec email
  - Follow-up 1
  - Follow-up 2
  - Final follow-up
- Local tracker record for each generated spec:
  - Manager name
  - Company
  - Role/title
  - LinkedIn screenshot filename
  - Email address
  - Module focus
  - Main spec email
  - Follow-up 1
  - Follow-up 2
  - Final follow-up
  - Date created
  - Date sent
  - Status

## Status flow
- Draft
- Sent
- Follow-up 1 due
- Follow-up 1 sent
- Follow-up 2 due
- Follow-up 2 sent
- Final follow-up due
- Closed
- Replied

Buttons available on records:
- Mark as Sent
- Mark Follow-up 1 Sent
- Mark Follow-up 2 Sent
- Mark Final Follow-up Sent
- Mark as Replied
- Close

Follow-up due rules after main spec is sent:
- Follow-up 1 due at day +2
- Follow-up 2 due at day +5
- Final follow-up due at day +9

## Dashboard
Top dashboard shows:
- Specs created today
- Specs sent today
- Follow-ups due today
- Overdue follow-ups
- Replies logged
- Open specs

Sections:
- Follow-ups Due Today (copy + mark as sent actions)
- Overdue Follow-ups

## Filters
- Company
- Manager
- Module
- Status
- Due today only

## Persistence and backup
- All data stored in browser localStorage only.
- Export CSV.
- Export JSON backup.
- Import CSV or JSON backup.
- Warning confirmation before Clear / Reset Day.

## Guardrails
- No automatic email sending.
- No LinkedIn scraping.
- No login flow.
- Everything stays local in-browser.

## Run
Open `index.html` directly or run a static server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.
