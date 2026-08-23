import { Stack } from 'expo-router';
import '../src/polyfills';
import { useAppFonts } from '../src/theme/fonts';
import { useStorageInit } from '../src/db/useStorage';
import { ActivityIndicator, View } from 'react-native';
import { colors } from '../src/theme/theme';

// Root navigator. The (tabs) group is the bottom-tab shell; trip detail and
// new-trip are pushed modally / onto the stack.
export default function RootLayout() {
  const fontsLoaded = useAppFonts();
  const { ready, error } = useStorageInit();

  if (!fontsLoaded || !ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
        {error && <View />}
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {/* Trip detail renders its own dark header — hide the native (white) one. */}
      <Stack.Screen name="trip/[id]" options={{ title: 'Trip', headerShown: false }} />
      <Stack.Screen
        name="trips/new"
        options={{ presentation: 'modal', title: 'New trip', headerShown: false }}
      />
    </Stack>
  );
}
