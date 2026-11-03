import { Album } from '@/components/Album';

export const dynamic = 'force-dynamic';

export default function AlbumPage() {
  return <Album tripName={process.env.NEXT_PUBLIC_TRIP_NAME || 'The Cazcabel Trip'} />;
}
