/**
 * SafeScreen — wraps every screen in safe area insets + theme background.
 * Handles status bar, safe-area edges, and consistent screen background.
 */
import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Colors, Spacing } from '@/theme';

interface SafeScreenProps {
  children: React.ReactNode;
  /** Extra padding inside the safe area. Default: horizontal xl */
  style?: ViewStyle;
  /** Which edges to respect safe area on. Default: all */
  edges?: Array<'top' | 'bottom' | 'left' | 'right'>;
  /** Whether to use horizontal padding. Default: true */
  padded?: boolean;
}

export default function SafeScreen({
  children,
  style,
  edges = ['top', 'left', 'right'],
  padded = true,
}: SafeScreenProps) {
  return (
    <SafeAreaView edges={edges} style={[styles.container, style]}>
      <StatusBar style="light" />
      <View style={[styles.inner, padded && styles.padded]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.obsidian,
  },
  inner: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: Spacing.xl,
  },
});
