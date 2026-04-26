# BD Spec Generator

Simple internal web app for generating SAP outreach specs from **manually uploaded LinkedIn screenshots**.

## What it does
- Upload screenshot and (optionally) add notes.
- Uses OpenAI vision to extract:
  - manager name
  - company name
  - role/title
  - visible SAP/hiring context
- Generates:
  - subject
  - main FAKE CANDO spec email
  - follow-up 1
  - follow-up 2
  - final follow-up
- Saves each generated spec in **Today's Specs** via browser local storage.
- Adds copy buttons for each generated field.
- Exports all specs as CSV (includes follow-up due date and status fields).
- Follow-up tracking:
  - status: Draft / Sent / Follow-up Due / Followed Up
  - Mark as Sent stores sent date and calculates follow-up due date (+2 days)
  - Follow-ups Due Today section
  - Mark follow-up completed

## Guardrails
- No scraping LinkedIn.
- No login automation for LinkedIn.
- No automatic browsing of LinkedIn.
- Only manually uploaded screenshots and optional typed notes.

## Setup
1. Clone this repo.
2. Open `index.html` in your browser (or serve folder with any static server).
3. Enter your OpenAI API key in the app's API key input.
   - The key is stored in browser `localStorage` only.

## OpenAI API key
- The app calls `POST https://api.openai.com/v1/responses` from the browser.
- For internal/demo use only. In production, move API calls to a backend to avoid exposing keys client-side.

## Run locally with a simple server (optional)
```bash
python3 -m http.server 8000
```
Then open `http://localhost:8000`.

## Notes
- If manager name or company name is not clearly visible in the screenshot, fill these fields manually before generating.
