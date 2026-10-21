import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "../components/Avatar";
import { BRAND_PERSON } from "../constants";
import { styles } from "../styles";
import type { AuthMode } from "../types";

export function SignInScreen({
  busy,
  error,
  serverUrl,
  onSubmit,
  onClearError,
}: {
  busy: boolean;
  error: string | null;
  serverUrl: string;
  onSubmit: (
    mode: AuthMode,
    values: { name: string; email: string; password: string },
  ) => void;
  onClearError: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const canSubmit =
    !busy &&
    email.trim().length > 0 &&
    password.length >= 8 &&
    (mode === "signin" || name.trim().length > 0);

  function submit() {
    if (!canSubmit) return;
    onSubmit(mode, {
      name: name.trim(),
      email: email.trim(),
      password,
    });
  }

  function toggleMode() {
    setMode((current) => (current === "signin" ? "signup" : "signin"));
    onClearError();
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[
        styles.flex,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 },
      ]}
    >
      <ScrollView
        contentContainerStyle={styles.signInScrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Avatar person={BRAND_PERSON} size={72} />
        <Text style={styles.signInTitle}>
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </Text>
        <Text style={styles.signInBody}>
          {mode === "signin"
            ? "Sign in to your Open Services workspace. Conversations sync with the local PocketBase server and arrive in realtime."
            : "Create an email account for this Open Services deployment. You can start a conversation with any other member right away."}
        </Text>

        {mode === "signup" ? (
          <>
            <Text style={styles.inputLabel}>DISPLAY NAME</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor="#8D919C"
              style={[styles.signInInput, styles.fieldSpacing]}
              autoCapitalize="words"
              autoComplete="name"
              accessibilityLabel="Display name"
            />
          </>
        ) : null}

        <Text style={styles.inputLabel}>EMAIL</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor="#8D919C"
          style={[styles.signInInput, styles.fieldSpacing]}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          accessibilityLabel="Email"
        />

        <Text style={styles.inputLabel}>PASSWORD</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="At least 8 characters"
          placeholderTextColor="#8D919C"
          style={[styles.signInInput, styles.fieldSpacing]}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
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
            <ActivityIndicator color="#FFF" />
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
              ? "Need an account? Create one"
              : "Already have an account? Sign in"}
          </Text>
        </Pressable>

        <View style={styles.demoCard}>
          <Text style={styles.demoTitle}>DEMO ACCOUNTS</Text>
          <Text style={styles.demoText}>
            marcos@example.com · openservices{"\n"}
            sarah@example.com · openservices
          </Text>
        </View>

        <Text style={styles.authServer}>Server: {serverUrl}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
