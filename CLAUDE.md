# Cazcabel Trip album — working notes for Claude

- **Start with HANDOFF.md** — current state, what is verified, what is not, open items.

- **Always restate the album link when it comes up.** Richard works from his phone,
  so whenever the album, the site, testing, or sharing is referenced, include the
  full link again as plain text on its own line, ready to copy:
  `https://cazcabel-trip.vercel.app/<ALBUM_TOKEN>`. The token is the `ALBUM_TOKEN`
  environment variable in Vercel; if it isn't in the conversation, ask Richard for
  it rather than guessing. Never shorten the link or wrap it in a code block.
- When sharing values he must paste on a phone (env vars, codes), put each name and
  each value on its own plain-text line, not in a shared code block.
- Live site: project `cazcabel-trip` on Vercel, deploys from `main`. Health check at
  `/api/health` (after following the secret link) shows env wiring and DB state.
- This session's cloud environment cannot reach `*.vercel.app` or `vercel.com`;
  Richard checks the live site and pastes results.
- See README.md for architecture and the privacy model (on-device face detection,
  selfie fingerprints only, self-search only, "Forget my face").
