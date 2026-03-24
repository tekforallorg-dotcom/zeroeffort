/**
 * Tab navigator — 4 screens: Home, Fly, Gallery, History.
 * Bottom bar uses smoked glass material with Ice Glow active states.
 */
import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontFamily, Spacing } from '@/theme';

type TabIconProps = {
  color: string;
  size: number;
  focused: boolean;
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.electricSky,
        tabBarInactiveTintColor: Colors.textTertiary,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }: TabIconProps) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="fly"
        options={{
          title: 'Fly',
          tabBarIcon: ({ color, size }: TabIconProps) => (
            <Ionicons name="paper-plane-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="gallery"
        options={{
          title: 'Gallery',
          tabBarIcon: ({ color, size }: TabIconProps) => (
            <Ionicons name="images-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, size }: TabIconProps) => (
            <Ionicons name="time-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: 'rgba(12,14,18,0.92)',
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(200,220,255,0.08)',
    height: Platform.OS === 'ios' ? 88 : 64,
    paddingTop: Spacing.xs,
    paddingBottom: Platform.OS === 'ios' ? 28 : Spacing.sm,
    // Smoked glass depth
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  tabLabel: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  tabItem: {
    paddingTop: 4,
  },
});
