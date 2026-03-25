# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Breathwork testimonial recording tool for breathofoneness.com. Clients record a video or audio testimonial after their session and it uploads automatically to Google Drive + GoHighLevel.

## Commands

```bash
npm install          # install dependencies
npm run dev          # development (nodemon auto-reload)
npm start            # production
```

## Setup

1. Copy `.env.example` to `.env` and fill in credentials
2. Google Drive: requires a **service account** with Drive API enabled. Share the target folder with the service account email.
3. GoHighLevel: requires a **Private Integration API Key** and Location ID from GHL settings.

## Architecture

- **`server.js`** — Express backend. Single `/upload` endpoint: receives multipart form data, uploads to Google Drive via service account, then creates/updates a GHL contact and adds a note with the Drive link.
- **`public/index.html`** — 3-step UI: info form → record → success
- **`public/app.js`** — MediaRecorder API for video/audio capture, audio visualizer via Web Audio API + Canvas, posts FormData to `/upload`
- **`public/style.css`** — Styled to match breathofoneness.com palette (gold `#c9a35a`, navy `#0f1a24`, cream `#f6f3ec`; Cinzel + Raleway fonts)

## Key details

- Recordings are saved as `.webm` with a timestamped filename
- GHL: searches for existing contact by email before creating a new one; adds a note with the Drive link and any written feedback
- Temp files land in `uploads/` and are deleted after upload
- The page works as a shareable link and can be embedded in an iframe
