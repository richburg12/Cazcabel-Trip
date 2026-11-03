// Scene tags shared by server and browser (no SDK imports here). Each becomes
// a tab when at least one photo carries it. The descriptions Claude uses to
// assign them live in lib/tags.ts.
export const TAGS = [
  { id: 'distillery', label: 'Distillery' },
  { id: 'agave', label: 'Agave fields' },
  { id: 'food_drink', label: 'Food & drink' },
  { id: 'nightlife', label: 'Nightlife' },
  { id: 'pool_beach', label: 'Pool & beach' },
  { id: 'town', label: 'Town' },
  { id: 'transport', label: 'On the move' },
] as const;
export type TagId = (typeof TAGS)[number]['id'];
export const TAG_IDS = TAGS.map((t) => t.id) as [TagId, ...TagId[]];
export const isTagId = (v: unknown): v is TagId => typeof v === 'string' && (TAG_IDS as string[]).includes(v);
export const tagLabel = (id: string) => TAGS.find((t) => t.id === id)?.label || id;
