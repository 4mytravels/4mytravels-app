import { useLocalSearchParams } from 'expo-router';
import { TripEditor } from '../../trips/new';

// G1: edit route for a trip (was /trips/new?editId=<id>, which now redirects here).
export default function EditTripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TripEditor editId={id} />;
}
