import Feather from "@expo/vector-icons/Feather";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Avatar } from "../components/Avatar";
import { Logo } from "../components/Logo";
import { ScreenHeader } from "../components/ScreenHeader";
import { styles } from "../styles";
import { colors } from "../theme";
import type { NotificationPref, Session } from "../types";

export function ProfileScreen({
  session,
  notificationPref,
  onNotificationPrefChange,
  onAbout,
  onSignOut,
}: {
  session: Session;
  notificationPref: NotificationPref;
  onNotificationPrefChange: (value: NotificationPref) => void;
  onAbout: () => void;
  onSignOut: () => void;
}) {
  return (
    <View style={styles.flex}>
      <ScreenHeader>
        <View style={styles.brandRow}>
          <View style={styles.brandLockup}>
            <Logo size={28} tone="paper" />
            <Text style={styles.wordmark}>Open Services</Text>
          </View>
          <Avatar person={session.user} size={36} />
        </View>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.screenTitle}>
            {session.user.name}
          </Text>
          <Text numberOfLines={1} style={styles.screenMeta}>
            {session.email}
          </Text>
        </View>
      </ScreenHeader>
      <ScrollView contentContainerStyle={styles.profileContent}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Notifications</Text>
        </View>
        {(
          [
            ["all", "All activity"],
            ["mentions", "Mentions only"],
            ["muted", "Muted"],
          ] as [NotificationPref, string][]
        ).map(([value, label]) => {
          const active = notificationPref === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => onNotificationPrefChange(value)}
              style={({ pressed }) => [
                styles.optionRow,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.settingTitle}>{label}</Text>
              <View style={styles.optionCheckSlot}>
                {active ? (
                  <Feather name="check" size={18} color={colors.accentDeep} />
                ) : null}
              </View>
            </Pressable>
          );
        })}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>About</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onAbout}
          style={({ pressed }) => [
            styles.optionRow,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.settingTitle}>About Open Services</Text>
          <Feather name="chevron-right" size={18} color={colors.faint} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={onSignOut}
          style={styles.signOutButton}
        >
          <Text style={styles.dangerText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
