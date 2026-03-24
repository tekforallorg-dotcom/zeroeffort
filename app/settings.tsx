/**
 * Settings Screen — drone selection, account info, sign out.
 *
 * Stack screen (not a tab) — navigated from Home header gear icon.
 * Fetches drone_plugins from Supabase and lets user pick their drone.
 * Selected drone saved to user_drones table.
 */
import { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet, Text, View, Pressable, ScrollView, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import SafeScreen from '@/components/SafeScreen';
import DroneSelector from '@/components/DroneSelector';
import { useAuth } from '@/lib/auth';
import { useDrone } from '@/store/droneStore';
import { supabase } from '@/lib/supabase';
import {
  Colors, Typography, Surfaces, Shadow, Spacing, Radii, FontFamily,
} from '@/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { switchAdapter, activeAdapterId } = useDrone();
  const [selectedDroneId, setSelectedDroneId] = useState<string | null>(null);
  const [selectedDroneName, setSelectedDroneName] = useState<string | null>(null);

  // Load user's current drone selection
  useEffect(() => {
    if (!user) return;
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from('user_drones')
        .select('plugin_id, drone_plugins(brand, name)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (mounted && data) {
        setSelectedDroneId(data.plugin_id);
        const dp = data.drone_plugins as unknown as { brand: string; name: string } | null;
        if (dp) {
          setSelectedDroneName(`${dp.brand} ${dp.name}`);
        }
      }
    })();
    return () => { mounted = false; };
  }, [user]);

  const handleSelectDrone = useCallback(async (pluginId: string, droneName: string) => {
    if (!user) return;

    // Upsert: delete old selection, insert new
    await supabase
      .from('user_drones')
      .delete()
      .eq('user_id', user.id);

    const { error } = await supabase
      .from('user_drones')
      .insert({
        user_id: user.id,
        plugin_id: pluginId,
        nickname: droneName,
      });

    if (error) {
      console.error('[Settings] Save drone error:', error);
      Alert.alert('Error', 'Could not save drone selection. Try again.');
      return;
    }

    setSelectedDroneId(pluginId);
    setSelectedDroneName(droneName);
    switchAdapter(pluginId);
    Alert.alert('Drone Selected', `${droneName} is now your active drone.`);
  }, [user, switchAdapter]);

  const handleWaitlist = useCallback((droneId: string) => {
    Alert.alert(
      'Waitlist Joined',
      "We'll notify you when this drone becomes available on your platform.",
    );
  }, []);

  const handleSignOut = useCallback(async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
        },
      },
    ]);
  }, [signOut]);

  return (
    <SafeScreen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* ── Header ──────────────────────────────────── */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={[Typography.h1, styles.headerTitle]}>Settings</Text>
        </View>

        {/* ── Account ─────────────────────────────────── */}
        <View style={[Surfaces.panel, Shadow.sm, styles.section]}>
          <Text style={[Typography.label, styles.sectionTitle]}>ACCOUNT</Text>
          <View style={styles.accountRow}>
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={20} color={Colors.electricSky} />
            </View>
            <View style={styles.accountInfo}>
              <Text style={[Typography.h3, styles.accountEmail]} numberOfLines={1}>
                {user?.email ?? 'Not signed in'}
              </Text>
              <Text style={[Typography.bodySmall, styles.accountSub]}>
                {selectedDroneName
                  ? `Active drone: ${selectedDroneName}`
                  : 'No drone selected'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Drone Selection ─────────────────────────── */}
        <View style={styles.section}>
          <DroneSelector
            selectedId={selectedDroneId}
            onSelect={handleSelectDrone}
            onWaitlist={handleWaitlist}
          />
        </View>

        {/* ── Danger Zone ─────────────────────────────── */}
        <View style={styles.section}>
          <Pressable
            onPress={handleSignOut}
            style={({ pressed }) => [
              styles.signOutBtn,
              pressed && { opacity: 0.7 },
            ]}
            accessibilityLabel="Sign out"
            accessibilityRole="button"
          >
            <Ionicons name="log-out-outline" size={18} color={Colors.danger} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </View>

        {/* ── App Info ────────────────────────────────── */}
        <Text style={[Typography.bodySmall, styles.appInfo]}>
          ZeroEffort v0.9.0 • Tek4All
        </Text>
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: Spacing.hero },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    marginTop: Spacing.lg, marginBottom: Spacing.xxl,
  },
  backBtn: { padding: Spacing.xs },
  headerTitle: { flex: 1 },

  // Sections
  section: { marginBottom: Spacing.xxl },
  sectionTitle: { color: Colors.textTertiary, marginBottom: Spacing.md },

  // Account
  accountRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.lg,
  },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(52,200,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(52,200,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  accountInfo: { flex: 1 },
  accountEmail: { color: Colors.textPrimary },
  accountSub: { color: Colors.textTertiary, marginTop: 2 },

  // Sign out
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: 'rgba(255,59,48,0.08)',
    borderRadius: Radii.md, padding: Spacing.lg,
    borderWidth: 0.5, borderColor: 'rgba(255,59,48,0.15)',
  },
  signOutText: {
    fontFamily: FontFamily.headingSemiBold, fontSize: 14, color: Colors.danger,
  },

  // Footer
  appInfo: {
    textAlign: 'center', color: Colors.textTertiary,
    marginTop: Spacing.xl,
  },
});
