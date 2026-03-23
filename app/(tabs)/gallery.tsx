/**
 * Gallery Screen — outputs from flights with shot labels. NOW WIRED.
 *
 * Shows captured photos from command history (mock URIs for now).
 * Each output labeled with the command that created it.
 */
import { StyleSheet, Text, View, Pressable, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SafeScreen from '@/components/SafeScreen';
import { useDrone } from '@/store/droneStore';
import { useRouter } from 'expo-router';
import {
  Colors, Typography, Surfaces, Shadow, Spacing, Radii, FontFamily,
} from '@/theme';

export default function GalleryScreen() {
  const { commandHistory } = useDrone();
  const router = useRouter();

  // Filter to only photo capture commands that executed
  const photos = commandHistory.filter(
    (e) => e.parsedIntent?.intent === 'capture_photo' && e.executed
  );

  return (
    <SafeScreen>
      {/* ── Header ────────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={Typography.label}>YOUR SHOTS</Text>
        <Text style={[Typography.h1, styles.title]}>Gallery</Text>
        {photos.length > 0 && (
          <Text style={[Typography.bodySmall, styles.subtitle]}>
            {photos.length} photo{photos.length !== 1 ? 's' : ''} captured
          </Text>
        )}
      </View>

      {photos.length === 0 ? (
        /* ── Empty State ───────────────────────────────── */
        <View style={styles.emptyContainer}>
          <View style={[Surfaces.panel, Shadow.sm, styles.emptyCard]}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="images-outline" size={48} color={Colors.textTertiary} />
            </View>
            <Text style={[Typography.h2, styles.emptyTitle]}>No shots yet</Text>
            <Text style={[Typography.bodySmall, styles.emptyBody]}>
              Your photos and videos will appear here after your first flight.
              Try saying "take a photo" while flying.
            </Text>
            <Pressable
              onPress={() => router.navigate('/')}
              style={({ pressed }) => [styles.ctaButton, pressed && styles.ctaButtonPressed]}
              accessibilityLabel="Go to Home screen"
              accessibilityRole="button"
            >
              <Ionicons name="paper-plane-outline" size={18} color={Colors.obsidian} />
              <Text style={styles.ctaText}>Start Flying</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        /* ── Photo Grid ───────────────────────────────── */
        <FlatList
          data={photos}
          numColumns={2}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={styles.gridRow}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <View style={[Surfaces.chassis, styles.photoCard]}>
              {/* Mock photo placeholder with gradient */}
              <View style={[styles.photoPlaceholder, { backgroundColor: getPhotoColor(index) }]}>
                <Ionicons name="image" size={32} color="rgba(255,255,255,0.3)" />
              </View>
              <View style={styles.photoMeta}>
                <Text style={styles.photoLabel} numberOfLines={1}>
                  {item.userInput}
                </Text>
                <Text style={styles.photoTime}>
                  {new Date(item.timestamp).toLocaleTimeString([], {
                    hour: '2-digit', minute: '2-digit',
                  })}
                </Text>
              </View>
            </View>
          )}
        />
      )}
    </SafeScreen>
  );
}

/** Generate varied placeholder colors for mock photos */
function getPhotoColor(index: number): string {
  const colors = [
    'rgba(52,200,255,0.15)',
    'rgba(52,199,89,0.15)',
    'rgba(155,231,255,0.12)',
    'rgba(255,159,10,0.12)',
  ];
  return colors[index % colors.length] ?? colors[0]!;
}

const styles = StyleSheet.create({
  header: { marginTop: Spacing.lg, marginBottom: Spacing.xxl },
  title: { marginTop: Spacing.xs },
  subtitle: { marginTop: Spacing.xs, color: Colors.textTertiary },

  // Empty
  emptyContainer: { flex: 1, justifyContent: 'center', paddingBottom: Spacing.hero },
  emptyCard: { padding: Spacing.xxxl, alignItems: 'center', gap: Spacing.lg },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm,
  },
  emptyTitle: { color: Colors.textSecondary },
  emptyBody: {
    textAlign: 'center', lineHeight: 22,
    color: Colors.textTertiary, paddingHorizontal: Spacing.lg,
  },
  ctaButton: {
    marginTop: Spacing.md, backgroundColor: Colors.electricSky,
    borderRadius: Radii.md, paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxl, flexDirection: 'row',
    alignItems: 'center', gap: Spacing.sm,
  },
  ctaButtonPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  ctaText: { fontFamily: FontFamily.headingSemiBold, fontSize: 14, color: Colors.obsidian },

  // Grid
  gridContent: { paddingBottom: Spacing.hero },
  gridRow: { gap: Spacing.md, marginBottom: Spacing.md },
  photoCard: { flex: 1, overflow: 'hidden' },
  photoPlaceholder: {
    height: 140, alignItems: 'center', justifyContent: 'center',
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
  },
  photoMeta: { padding: Spacing.md },
  photoLabel: {
    fontFamily: FontFamily.headingSemiBold, fontSize: 11,
    color: Colors.textSecondary, textTransform: 'capitalize',
  },
  photoTime: {
    fontFamily: FontFamily.monoRegular, fontSize: 10,
    color: Colors.textTertiary, marginTop: 2,
  },
});
