/**
 * DroneSelector — compatibility wizard component.
 *
 * Fetches drone_plugins from Supabase and shows each drone with
 * platform-specific status: green (available), amber (coming soon),
 * grey (planned). Users can select available drones or join waitlist.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet, Text, View, Pressable, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import {
  Colors, Typography, Surfaces, Shadow, Spacing, Radii, FontFamily,
} from '@/theme';

// ─── Types ─────────────────────────────────────────────────────

interface PlatformStatus {
  status: 'available' | 'coming_soon' | 'planned';
}

interface DronePluginRow {
  id: string;
  brand: string;
  name: string;
  platforms: { android?: PlatformStatus; ios?: PlatformStatus };
  connection_method: string;
  features: Record<string, boolean>;
  is_popular: boolean;
  display_order: number;
}

interface DroneSelectorProps {
  /** Currently selected drone plugin_id (null if none) */
  selectedId: string | null;
  /** Called when user selects a drone */
  onSelect: (pluginId: string, droneName: string) => void;
  /** Called when user joins waitlist for an unavailable drone */
  onWaitlist?: (pluginId: string) => void;
}

// ─── Status helpers ────────────────────────────────────────────

function getCurrentPlatform(): 'android' | 'ios' {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

function getStatusForPlatform(
  platforms: DronePluginRow['platforms']
): 'available' | 'coming_soon' | 'planned' {
  const platform = getCurrentPlatform();
  return platforms[platform]?.status ?? 'planned';
}

function statusLabel(status: string): string {
  switch (status) {
    case 'available': return 'Available';
    case 'coming_soon': return 'Coming Soon';
    case 'planned': return 'Planned';
    default: return 'Unknown';
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'available': return Colors.success;
    case 'coming_soon': return Colors.warning;
    case 'planned': return Colors.textTertiary;
    default: return Colors.textTertiary;
  }
}

function statusIcon(status: string): 'checkmark-circle' | 'time-outline' | 'ellipsis-horizontal-circle-outline' {
  switch (status) {
    case 'available': return 'checkmark-circle';
    case 'coming_soon': return 'time-outline';
    default: return 'ellipsis-horizontal-circle-outline';
  }
}

// ─── Component ─────────────────────────────────────────────────

export default function DroneSelector({
  selectedId,
  onSelect,
  onWaitlist,
}: DroneSelectorProps) {
  const { user } = useAuth();
  const [drones, setDrones] = useState<DronePluginRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [waitlisted, setWaitlisted] = useState<Set<string>>(new Set());

  // Fetch drones from Supabase
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from('drone_plugins')
        .select('*')
        .order('display_order', { ascending: true });

      if (mounted && data) {
        setDrones(data as DronePluginRow[]);
      }
      if (error) {
        console.error('[DroneSelector] Fetch error:', error);
      }
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  // Check existing waitlist entries
  useEffect(() => {
    if (!user) return;
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from('plugin_waitlist')
        .select('drone_id')
        .eq('user_id', user.id)
        .eq('platform', getCurrentPlatform());

      if (mounted && data) {
        setWaitlisted(new Set(data.map((r) => r.drone_id)));
      }
    })();
    return () => { mounted = false; };
  }, [user]);

  const handleWaitlist = useCallback(async (droneId: string) => {
    if (!user) return;
    const platform = getCurrentPlatform();

    const { error } = await supabase
      .from('plugin_waitlist')
      .upsert(
        { user_id: user.id, drone_id: droneId, platform },
        { onConflict: 'user_id,drone_id,platform' }
      );

    if (!error) {
      setWaitlisted((prev) => new Set([...prev, droneId]));
      onWaitlist?.(droneId);
    } else {
      console.error('[DroneSelector] Waitlist error:', error);
    }
  }, [user, onWaitlist]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.electricSky} />
        <Text style={[Typography.bodySmall, styles.loadingText]}>
          Loading supported drones...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={[Typography.label, styles.sectionLabel]}>
        SELECT YOUR DRONE
      </Text>
      <Text style={[Typography.bodySmall, styles.subtitle]}>
        {Platform.OS === 'ios' ? 'Showing iOS' : 'Showing Android'} compatibility
      </Text>

      {drones.map((drone) => {
        const status = getStatusForPlatform(drone.platforms);
        const isAvailable = status === 'available';
        const isSelected = selectedId === drone.id;
        const isOnWaitlist = waitlisted.has(drone.id);

        return (
          <Pressable
            key={drone.id}
            onPress={() => {
              if (isAvailable) {
                onSelect(drone.id, `${drone.brand} ${drone.name}`);
              } else if (!isOnWaitlist) {
                handleWaitlist(drone.id);
              }
            }}
            style={({ pressed }) => [
              Surfaces.panel,
              styles.droneCard,
              isSelected && styles.droneCardSelected,
              pressed && isAvailable && { opacity: 0.85 },
            ]}
            accessibilityLabel={`${drone.brand} ${drone.name} — ${statusLabel(status)}`}
            accessibilityRole="button"
          >
            <View style={styles.droneHeader}>
              {/* Status indicator */}
              <Ionicons
                name={statusIcon(status)}
                size={20}
                color={statusColor(status)}
              />

              {/* Drone info */}
              <View style={styles.droneInfo}>
                <View style={styles.droneNameRow}>
                  <Text style={[Typography.h3, styles.droneName]}>
                    {drone.brand} {drone.name}
                  </Text>
                  {drone.is_popular && (
                    <View style={styles.popularBadge}>
                      <Text style={styles.popularText}>POPULAR</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.droneDetails}>
                  {drone.connection_method === 'none'
                    ? 'No hardware needed'
                    : `${drone.connection_method.toUpperCase()} connection`}
                  {drone.id === 'mock-adapter' ? ' • For testing' : ''}
                </Text>
              </View>

              {/* Action */}
              {isSelected ? (
                <View style={styles.selectedBadge}>
                  <Ionicons name="checkmark" size={14} color={Colors.obsidian} />
                </View>
              ) : isAvailable ? (
                <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
              ) : isOnWaitlist ? (
                <View style={styles.waitlistBadge}>
                  <Text style={styles.waitlistText}>JOINED</Text>
                </View>
              ) : (
                <Text style={[styles.waitlistLink, { color: statusColor(status) }]}>
                  {status === 'coming_soon' ? 'Join Waitlist' : ''}
                </Text>
              )}
            </View>

            {/* Status bar */}
            <View style={[styles.statusBar, { backgroundColor: `${statusColor(status)}15` }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor(status) }]} />
              <Text style={[styles.statusLabel, { color: statusColor(status) }]}>
                {statusLabel(status)}
                {status === 'coming_soon' ? ' — tap to join waitlist' : ''}
                {status === 'planned' ? ' — no timeline yet' : ''}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { gap: Spacing.md },
  sectionLabel: { color: Colors.textTertiary },
  subtitle: { color: Colors.textTertiary, marginBottom: Spacing.sm },

  loadingContainer: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: Spacing.hero, gap: Spacing.md,
  },
  loadingText: { color: Colors.textTertiary },

  // Card
  droneCard: {
    padding: Spacing.lg, gap: Spacing.md,
    borderWidth: 0.5, borderColor: 'transparent',
  },
  droneCardSelected: {
    borderColor: Colors.electricSky,
    ...Shadow.glow,
  },
  droneHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
  },
  droneInfo: { flex: 1 },
  droneNameRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
  },
  droneName: { color: Colors.textPrimary },
  droneDetails: {
    fontFamily: FontFamily.bodyRegular, fontSize: 12,
    color: Colors.textTertiary, marginTop: 2,
  },

  // Badges
  popularBadge: {
    backgroundColor: 'rgba(52,200,255,0.12)', borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  popularText: {
    fontFamily: FontFamily.monoRegular, fontSize: 8,
    color: Colors.electricSky, letterSpacing: 0.5,
  },
  selectedBadge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.electricSky,
    alignItems: 'center', justifyContent: 'center',
  },
  waitlistBadge: {
    backgroundColor: 'rgba(255,159,10,0.12)', borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  waitlistText: {
    fontFamily: FontFamily.monoRegular, fontSize: 8,
    color: Colors.warning, letterSpacing: 0.5,
  },
  waitlistLink: {
    fontFamily: FontFamily.headingSemiBold, fontSize: 11,
  },

  // Status bar
  statusBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    borderRadius: Radii.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: {
    fontFamily: FontFamily.monoRegular, fontSize: 10, letterSpacing: 0.3,
  },
});
