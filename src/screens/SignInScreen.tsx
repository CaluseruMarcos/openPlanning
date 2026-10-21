import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Logo } from "../components/Logo";
import { styles } from "../styles";
import { colors } from "../theme";
import type { AuthMode } from "../types";

export function SignInScreen({
  busy,
  error,
  onSubmit,
  onClearError,
}: {
  busy: boolean;
  error: string | null;
  onSubmit: (
    mode: AuthMode,
    values: { name: string; email: string; password: string; inviteCode: string },
  ) => void;
  onClearError: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [mode, setMode] = useState<AuthMode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const canSubmit =
    !busy &&
    email.trim().length > 0 &&
    password.length >= 8 &&
    (mode === "signin" || (name.trim().length > 0 && inviteCode.trim().length > 0));

  function submit() {
    if (!canSubmit) return;
    onSubmit(mode, {
      name: name.trim(),
      email: email.trim(),
      password,
      inviteCode: inviteCode.trim(),
    });
  }

  function toggleMode() {
    setMode((current) => (current === "signin" ? "signup" : "signin"));
    onClearError();
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.flex, styles.signInRoot]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.signInScrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.signInLayout, wide && styles.signInLayoutWide]}>
          <View
            style={[
              styles.signInHero,
              wide && styles.signInHeroWide,
              { paddingTop: insets.top + (wide ? 48 : 30) },
            ]}
          >
            <View style={styles.signInInner}>
              <View style={styles.brandLockup}>
                <Logo size={30} tone="paper" />
                <Text style={styles.wordmark}>Open Services</Text>
              </View>
              <Text style={[styles.signInTitle, wide && styles.signInTitleWide]}>
                For the team behind the service.
              </Text>
              <Text style={styles.signInBody}>
                Messages, activity, and read receipts in one place.
              </Text>
            </View>
          </View>

          <View style={[styles.signInForm, wide && styles.signInFormWide]}>
            <View style={styles.signInFormInner}>
              <Text style={styles.signInFormTitle}>
                {mode === "signin" ? "Sign in" : "Create account"}
              </Text>
              <Text style={styles.signInHint}>
                {mode === "signin"
                  ? "Use your account."
                  : "Use the invite code you were given."}
              </Text>

              {mode === "signup" ? (
                <>
                  <Text style={styles.inputLabel}>Name</Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="Your name"
                    placeholderTextColor={colors.faint}
                    style={[
                      styles.signInInput,
                      styles.fieldSpacing,
                      focusedField === "name" && styles.signInInputFocused,
                    ]}
                    autoCapitalize="words"
                    autoComplete="name"
                    onFocus={() => setFocusedField("name")}
                    onBlur={() => setFocusedField(null)}
                    accessibilityLabel="Name"
                  />

                  <Text style={styles.inputLabel}>Invite code</Text>
                  <TextInput
                    value={inviteCode}
                    onChangeText={setInviteCode}
                    placeholder="From the person who invited you"
                    placeholderTextColor={colors.faint}
                    style={[
                      styles.signInInput,
                      styles.fieldSpacing,
                      focusedField === "inviteCode" && styles.signInInputFocused,
                    ]}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    onFocus={() => setFocusedField("inviteCode")}
                    onBlur={() => setFocusedField(null)}
                    accessibilityLabel="Invite code"
                  />
                </>
              ) : null}

              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.faint}
                style={[
                  styles.signInInput,
                  styles.fieldSpacing,
                  focusedField === "email" && styles.signInInputFocused,
                ]}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoComplete="email"
                onFocus={() => setFocusedField("email")}
                onBlur={() => setFocusedField(null)}
                accessibilityLabel="Email"
              />

              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                placeholderTextColor={colors.faint}
                style={[
                  styles.signInInput,
                  styles.fieldSpacing,
                  focusedField === "password" && styles.signInInputFocused,
                ]}
                secureTextEntry
                autoCapitalize="none"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                onFocus={() => setFocusedField("password")}
                onBlur={() => setFocusedField(null)}
                accessibilityLabel="Password"
                onSubmitEditing={submit}
              />

              {error ? <Text style={styles.authError}>{error}</Text> : null}

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSubmit }}
                disabled={!canSubmit}
                onPress={submit}
                style={[
                  styles.primaryButton,
                  !canSubmit && styles.primaryButtonDisabled,
                ]}
              >
                {busy ? (
                  <ActivityIndicator color={colors.paper} />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {mode === "signin" ? "Sign in" : "Create account"}
                  </Text>
                )}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={toggleMode}
                style={styles.authToggle}
              >
                <Text style={styles.authToggleText}>
                  {mode === "signin"
                    ? "New here? Create an account"
                    : "Already have an account? Sign in"}
                </Text>
              </Pressable>

              {__DEV__ ? (
                <View style={styles.demoBlock}>
                  <Text style={styles.demoTitle}>Demo accounts</Text>
                  <Text style={styles.demoText}>
                    marcos@example.com{"\n"}
                    sarah@example.com{"\n"}
                    Password for both: openservices
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
