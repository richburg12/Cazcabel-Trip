// Vercel names the Blob token BLOB_READ_WRITE_TOKEN by default, but a store
// connected with a prefix gets e.g. CAZCABEL_TRIP_BLOB_READ_WRITE_TOKEN.
// Accept whichever is present so nothing has to be renamed in the dashboard.
export function blobTokenName(): string | null {
  if (process.env.BLOB_READ_WRITE_TOKEN) return 'BLOB_READ_WRITE_TOKEN';
  return Object.keys(process.env).find((k) => k.endsWith('READ_WRITE_TOKEN') && process.env[k]) || null;
}

export function blobToken(): string {
  const name = blobTokenName();
  if (!name) throw new Error('No Blob store token found. Connect a Blob store to the project in Vercel → Storage, then redeploy.');
  return process.env[name] as string;
}
