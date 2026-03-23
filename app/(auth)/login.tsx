/**
 * Login Screen — email/password auth with Aero-Metallic styling.
 *
 * Toggle between Sign In and Sign Up modes.
 * Friendly error messages, loading state, keyboard handling.
 */
import { useState, useCallback } from 'react';
import {
  StyleSheet, Text, View, TextInput, Pressable,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SafeScreen from '@/components/SafeScreen';
import { useAuth } from '@/lib/auth';
import {
  Colors, Typography, Surfaces, Shadow, Spacing, Radii, FontFamily,
} from '@/theme';

export default function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setError('Please enter both email and password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        const result = await signUp(trimmedEmail, password);
        if (result.error) {
          setError(result.error);
        } else {
          setSuccess('Account created! Check your email for a confirmation link.');
        }
      } else {
        const result = await signIn(trimmedEmail, password);
        if (result.error) {
          setError(result.error);
        }
        // On success, auth state change triggers navigation automatically
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [email, password, mode, signIn, signUp]);

  const toggleMode = useCallback(() => {
    setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
    setError(null);
    setSuccess(null);
  }, []);

  return (
    <SafeScreen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Brand Header ───────────────────────────── */}
          <View style={styles.brandSection}>
            <View style={[styles.logoCircle, Shadow.glow]}>
              <Ionicons name="paper-plane" size={32} color={Colors.electricSky} />
            </View>
            <Text style={[Typography.display, styles.brandTitle]}>ZeroEffort</Text>
            <Text style={[Typography.bodySmall, styles.brandSub]}>
              Talk to your drone. Get the shot.
            </Text>
          </View>

          {/* ── Auth Card ──────────────────────────────── */}
          <View style={[Surfaces.panel, Shadow.md, styles.authCard]}>
            <Text style={[Typography.h2, styles.cardTitle]}>
              {mode === 'signin' ? 'Welcome Back' : 'Create Account'}
            </Text>

            {/* Email */}
            <View style={styles.inputGroup}>
              <Text style={[Typography.label, styles.inputLabel]}>EMAIL</Text>
              <TextInput
                style={styles.input}
                placeholder="pilot@example.com"
                placeholderTextColor={Colors.textTertiary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                editable={!loading}
              />
            </View>

            {/* Password */}
            <View style={styles.inputGroup}>
              <Text style={[Typography.label, styles.inputLabel]}>PASSWORD</Text>
              <TextInput
                style={styles.input}
                placeholder="At least 6 characters"
                placeholderTextColor={Colors.textTertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                editable={!loading}
                onSubmitEditing={handleSubmit}
                returnKeyType="go"
              />
            </View>

            {/* Error */}
            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Success */}
            {success && (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle-outline" size={16} color={Colors.success} />
                <Text style={styles.successText}>{success}</Text>
              </View>
            )}

            {/* Submit */}
            <Pressable
              onPress={handleSubmit}
              disabled={loading}
              style={({ pressed }) => [
                styles.submitButton,
                pressed && styles.submitPressed,
                loading && styles.submitDisabled,
              ]}
              accessibilityLabel={mode === 'signin' ? 'Sign in' : 'Create account'}
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator size="small" color={Colors.obsidian} />
              ) : (
                <Text style={styles.submitText}>
                  {mode === 'signin' ? 'Sign In' : 'Create Account'}
                </Text>
              )}
            </Pressable>

            {/* Toggle mode */}
            <Pressable onPress={toggleMode} style={styles.toggleBtn}>
              <Text style={styles.toggleText}>
                {mode === 'signin'
                  ? "Don't have an account? Sign up"
                  : 'Already have an account? Sign in'}
              </Text>
            </Pressable>
          </View>

          {/* ── Footer ─────────────────────────────────── */}
          <Text style={[Typography.bodySmall, styles.footer]}>
            By continuing, you agree to fly responsibly.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1, justifyContent: 'center', paddingBottom: Spacing.hero,
  },

  // Brand
  brandSection: { alignItems: 'center', marginBottom: Spacing.xxxl },
  logoCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(52,200,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(52,200,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  brandTitle: { textAlign: 'center' },
  brandSub: { textAlign: 'center', color: Colors.textTertiary, marginTop: Spacing.xs },

  // Card
  authCard: { padding: Spacing.xxl, gap: Spacing.lg },
  cardTitle: { textAlign: 'center', marginBottom: Spacing.sm },

  // Inputs
  inputGroup: { gap: Spacing.xs },
  inputLabel: { color: Colors.textTertiary },
  input: {
    fontFamily: FontFamily.bodyRegular, fontSize: 15,
    color: Colors.textPrimary,
    backgroundColor: Colors.carbonFiber,
    borderRadius: Radii.md, borderWidth: 0.5,
    borderColor: 'rgba(200,220,255,0.08)',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },

  // Messages
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: 'rgba(255,59,48,0.08)',
    borderRadius: Radii.sm, padding: Spacing.md,
  },
  errorText: {
    fontFamily: FontFamily.bodyRegular, fontSize: 13,
    color: Colors.danger, flex: 1,
  },
  successBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: 'rgba(52,199,89,0.08)',
    borderRadius: Radii.sm, padding: Spacing.md,
  },
  successText: {
    fontFamily: FontFamily.bodyRegular, fontSize: 13,
    color: Colors.success, flex: 1,
  },

  // Submit
  submitButton: {
    backgroundColor: Colors.electricSky, borderRadius: Radii.lg,
    paddingVertical: Spacing.lg, alignItems: 'center',
  },
  submitPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  submitDisabled: { opacity: 0.6 },
  submitText: {
    fontFamily: FontFamily.headingSemiBold, fontSize: 16,
    color: Colors.obsidian,
  },

  // Toggle
  toggleBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  toggleText: {
    fontFamily: FontFamily.bodyRegular, fontSize: 13,
    color: Colors.electricSky,
  },

  // Footer
  footer: {
    textAlign: 'center', color: Colors.textTertiary,
    marginTop: Spacing.xxl,
  },
});
