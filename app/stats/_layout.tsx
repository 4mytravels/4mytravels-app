import { Stack } from 'expo-router';
import { colors } from '../../src/theme/theme';

export default function StatsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="countries" />
      <Stack.Screen name="over-time" />
    </Stack>
  );
}
