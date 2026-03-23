/**
 * Auth layout — simple stack for login/signup screens.
 */
import { Stack } from 'expo-router';
import { Colors } from '@/theme';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.obsidian },
        animation: 'fade',
      }}
    />
  );
}
