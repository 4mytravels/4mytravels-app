// Root route for the (tabs) group. Q16: a real redirect to /home instead of
// re-exporting the Home screen, so "/" and "/home" are no longer two routes
// for one screen (FloatingNav.isActive no longer has to treat them as equal).
import { Redirect } from 'expo-router';

export default function Index() {
  return <Redirect href="/home" />;
}
