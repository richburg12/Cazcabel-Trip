import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

import { TAG_IDS, type TagId } from '@/lib/tag-list';
export { TAGS, TAG_IDS, isTagId, tagLabel, type TagId } from '@/lib/tag-list';

// Scene tags are assigned by Claude from the thumbnail using the guide below.
// Edit lib/tag-list.ts to add a tag, and describe it here.
const GUIDE = `You tag photos from a group work trip to a tequila distillery in Mexico.
Pick every label that clearly applies. Prefer no label over a guess. At most three.

distillery — the production side of a tequila distillery: copper or steel stills, fermentation tanks or vats, brick ovens or autoclaves, a tahona stone wheel, roasted agave piñas, barrel rooms or stacked oak casks, bottling lines, warehouse/cellar interiors, a tasting room with production equipment visible, distillery signage or grounds.
agave — blue agave plants or fields outdoors, jimadores harvesting, piñas in a field.
food_drink — food, meals, cocktails, shots, bottles or glasses as the main subject; restaurant or bar tables.
nightlife — bars, clubs, parties or dinners at night; dancing, dim or coloured lights, stage, DJ.
pool_beach — swimming pools, beaches, sea, sunbeds.
town — streets, plazas, churches, markets, colourful buildings, murals, shops.
transport — airports, planes, buses, vans, cars, roads, luggage, travel in progress.`;

const Result = z.object({ tags: z.array(z.enum(TAG_IDS)) });

export function taggingEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ timeout: 25_000, maxRetries: 1 });
  return client;
}

// Returns the tags for one photo (given its public thumbnail URL). Throws on
// API failure so callers can decide whether to leave the photo untagged.
export async function tagPhoto(imageUrl: string): Promise<TagId[]> {
  const response = await anthropic().messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 256,
    system: GUIDE,
    output_config: { effort: 'low', format: zodOutputFormat(Result) },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: imageUrl } },
          { type: 'text', text: 'Which labels apply to this photo?' },
        ],
      },
    ],
  });
  if (response.stop_reason === 'refusal' || !response.parsed_output) return [];
  return Array.from(new Set(response.parsed_output.tags)).slice(0, 3);
}
