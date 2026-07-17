import { Tabs } from 'expo-router';
import { useTheme } from '@/hooks/use-theme';
import LiquidTabBar from '@/components/navigation/LiquidTabBar';

export default function TabLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      tabBar={(props) => <LiquidTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen name="dashboard" />
      <Tabs.Screen name="coach" />
      <Tabs.Screen name="workouts" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
