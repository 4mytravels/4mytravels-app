import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/theme';

// Bottom-tab shell for the MVP. We hide the default tab bar and render a
// custom floating nav (FloatingNav.tsx) above the tab content.
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Hide the default bottom tab bar
        tabBarStyle: { display: 'none' },
      }}
      tabBar={() => null}
    >
      <Tabs.Screen
        name="index"
        options={{
          href: null, // duplicate of Home — hide from the tab bar
        }}
      />
      <Tabs.Screen name="home" options={{ href: null }} />
      <Tabs.Screen name="trips" options={{ href: null }} />
      <Tabs.Screen name="expenses" options={{ href: null }} />
      <Tabs.Screen name="statistics" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}
