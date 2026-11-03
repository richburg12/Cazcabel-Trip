# HANDOFF — Cazcabel Trip album

Read this first in a new session. It is the state of the project as of
2026-11-03 ~22:00 UTC, written at the end of a mobile-only session.
Everything below the "Open items" line is what still needs doing.

## What this is

A private, phone-first shared photo album for a work trip (Cazcabel tequila).
Next.js 14 on Vercel, Neon Postgres (pgvector), Vercel Blob (OIDC credentials),
face detection in the browser (face-api), scene tags via Claude vision.
Architecture and privacy model: README.md. Working rules for Claude: CLAUDE.md.

## Live

- Project `cazcabel-trip` on Vercel, auto-deploys from `main`.
- Album link: `https://cazcabel-trip.vercel.app/<ALBUM_TOKEN>` — the token is the
  `ALBUM_TOKEN` env var in Vercel (also in the original chat). Not committed here.
- Admin code: `ADMIN_CODE` env var. Entered via profile circle → "Admin".
- Health: `https://cazcabel-trip.vercel.app/api/health?v=N` (after following the
  album link once so the cookie exists). Shows build sha, storage mode, DB identity,
  counts, newest photo, whether scene tagging is on.
- Env vars set in Vercel: ALBUM_TOKEN, ADMIN_CODE, ANTHROPIC_API_KEY, plus the
  integration-provided BLOB_STORE_ID / BLOB_WEBHOOK_PUBLIC_KEY / POSTGRES_URL etc.

## Verified working on the live site (by Richard, from his phone)

- Secret link gating, blank root, 401 API without cookie.
- Name + PIN sign-in; profile persists.
- Photo upload end to end (presigned/OIDC Blob flow): one photo saved, visible in
  grid, record in DB with correct dimensions and EXIF date, category "scenery".
- `/api/health`: database ok, blob ok, sceneTagging on, build da80cb8 or later.

## NOT yet verified on the live site

1. **Find me** (selfie → descriptor saved → pgvector search). Code path tested only
   by type-check/build. First thing to try.
2. **Scene tagging** on a real photo (`ANTHROPIC_API_KEY` is set; untested). Use the
   admin sheet button "Tag N older photos", then open the photo: tag chips should
   show in the lightbox; a "Distillery" tab appears once any photo has that tag.
3. **Save button** in the lightbox (share sheet on iOS/Android, download on desktop,
   falls back to opening full size if the cross-origin fetch is blocked). Added in
   the last commit of this session, untested on a device.
4. **Delete** (own photo / admin) and that the blob is removed too.
5. Multi-photo upload on a slow phone — watch memory; the pipeline is sequential.

## Known oddity to resolve

`/api/health` once reported `counts: {profiles:0, photos:0}` on build 24e1f35 while
`/api/photos` on the same deployment returned the saved photo. Build da80cb8 adds
`dbName`, `dbServer`, `dbVars` (host per connection-string var) and `newestPhoto` to
health. Compare that output with `/api/photos`: if hosts differ, two databases are
in play (Neon preview vs production branch?). If they match and counts are right,
it was a transient and can be ignored.

## Open items / ideas, in rough priority

- Verify the five items above with a desktop terminal + real phone.
- Logo: `public/logo.png` not yet added (cazcabel.com was blocked from the cloud
  session). Header shows a CAZCABEL wordmark until the file exists.
- Decide on tagging model cost: currently `claude-opus-5-5`, low effort, ~£2.50 per
  1,000 photos. `claude-haiku-5-5` would be ~40x cheaper. One line in `lib/tags.ts`.
- Optional: "Add to Home Screen" prompt, pull-to-refresh, date dividers in the grid.
- Optional: a "Download all" zip (would need a server job; Blob has the files).
- After the trip: delete the Postgres database (removes face fingerprints) and the
  Blob store, or the whole Vercel project.

## How to run locally

```
npm install
cp .env.example .env.local   # set ALBUM_TOKEN, ADMIN_CODE; POSTGRES_URL to a LOCAL
                             # Postgres with pgvector; BLOB_READ_WRITE_TOKEN from a
                             # test store (or skip uploads locally)
npm run dev                  # http://localhost:3000/<ALBUM_TOKEN>
```

`npx tsc --noEmit` and `npx next build` are the checks used so far; there is no
test suite. The cloud session that built this could not reach vercel.app, so no
live request was ever made from Claude's side — all live verification was manual.

## Commit history of this session (newest first)

- Save button in lightbox (share sheet / download)
- Health: database identity, newest photo, untagged count
- Scene tags via Claude vision (Distillery etc. as tabs), admin backfill
- Vercel Blob OIDC / presigned uploads (the fix that made uploads work)
- Health endpoint; clearer sign-in and upload errors
- Initial app
