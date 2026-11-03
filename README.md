# The Cazcabel Trip — shared photo album

A private, phone-first album for one group. Everyone uploads from their own
camera roll, the album sorts photos into **People / Groups / Scenery**, and
**Find me** pulls out every photo you appear in from a single selfie.

- **Private by link.** The album lives at `/<ALBUM_TOKEN>`. The site root is blank.
- **Name + PIN.** Each person picks a name and a 4–6 digit PIN the first time.
  That's what lets them delete their own uploads and use Find me. The admin code
  (yours) can delete anything.
- **Photos stay on the phone until chosen.** Uploading uses the normal photo
  picker, so the app only ever sees the pictures a person hand-picks.
- **Face recognition runs on the phone.** Faces are detected and turned into
  128-number fingerprints in the browser (face-api / TensorFlow.js, models in
  `public/models`). Only the fingerprints go to the database. A person's own
  selfie fingerprint is saved to their profile, searchable only by them, and
  removable with one tap ("Forget my face").
- **Categories** fall out of the face count: 0 faces → Scenery, 5+ → Groups,
  otherwise People.

## Deploy (Vercel, ~5 minutes)

1. **Import this repo** at vercel.com/new. Framework: Next.js, defaults are fine.
2. **Environment variables** (on the import screen or Settings → Environment Variables):

   | Name | Value |
   |------|-------|
   | `ALBUM_TOKEN` | long random string — this becomes the secret link |
   | `ADMIN_CODE` | your private code for deleting any photo |
   | `NEXT_PUBLIC_TRIP_NAME` | optional header, default "The Cazcabel Trip" |

3. **Storage tab → Create** a **Blob** store and a **Postgres** (Neon) database,
   both connected to the project. They inject `BLOB_READ_WRITE_TOKEN` and
   `POSTGRES_URL`. Tables and the `vector` extension are created automatically
   on first use.
4. **Redeploy** once storage is attached (Deployments → ⋯ → Redeploy).
5. Share `https://<your-project>.vercel.app/<ALBUM_TOKEN>` with the group.

## Branding

Drop the logo at `public/logo.png` (transparent PNG, roughly 4:1). Until it
exists the header shows a CAZCABEL wordmark. Colours and type are in
`tailwind.config.ts`.

## How it fits together

```
app/[token]/route.ts     secret link → sets album cookie → /album
middleware.ts            no album cookie: pages show the blank root, API answers 401
app/album/page.tsx       the app shell (components/Album.tsx does the work)
app/api/auth             name + PIN sign-in / create; admin code
app/api/upload           hands out Blob upload tokens (signed-in users, own folder, JPEG ≤ 12 MB)
app/api/photos           list by category (paged) / register an upload + its faces / delete
app/api/find             "My photos": faces within FACE_THRESHOLD (default 0.55) of the saved selfie
app/api/me               profile, save / forget the selfie fingerprint
lib/client/face.ts       face-api in the browser
lib/client/image.ts      EXIF date, decode, 1800px display JPEG + 480px thumbnail
lib/db.ts                Postgres + pgvector; schema auto-created
```

## Afterwards

When the trip is over, delete the Postgres database (that removes every face
fingerprint) and the Blob store, or just the project.
