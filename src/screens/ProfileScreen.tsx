import Feather from "@expo/vector-icons/Feather";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Avatar } from "../components/Avatar";
import { Logo } from "../components/Logo";
import { ScreenHeader } from "../components/ScreenHeader";
import { styles } from "../styles";
import { colors } from "../theme";
import type {
  Conversation,
  NotificationPref,
  Session,
} from "../types";

export function ProfileScreen({
  session,
  conversations,
  notificationPref,
  onNotificationPrefChange,
  onAbout,
  onSignOut,
}: {
  session: Session;
  conversations: Conversation[];
  notificationPref: NotificationPref;
  onNotificationPrefChange: (value: NotificationPref) => void;
  onAbout: () => void;
  onSignOut: () => void;
}) {
  const unread = conversations.reduce(
    (total, conversation) => total + conversation.unreadCount,
    0,
  );

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
        <Text style={styles.screenTitle}>Profile</Text>
        <Text numberOfLines={1} style={styles.screenMeta}>
          {session.email || "Signed in to this workspace"}
        </Text>
      </ScreenHeader>
      <ScrollView contentContainerStyle={styles.profileContent}>
        <View style={styles.profileCard}>
          <Avatar person={session.user} size={56} />
          <View style={styles.flex}>
            <Text style={styles.profileName}>{session.user.name}</Text>
            <Text numberOfLines={1} style={styles.profileSubtitle}>
              {session.email || "Email account"}
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{conversations.length}</Text>
            <Text style={styles.statLabel}>Conversations</Text>
          </View>
          <View style={[styles.statCard, styles.statCardDivider]}>
            <Text style={styles.statValue}>{unread}</Text>
            <Text style={styles.statLabel}>Unread</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
        <View style={styles.card}>
          {(
            [
              ["all", "All activity"],
              ["mentions", "Mentions only"],
              ["muted", "Muted"],
            ] as [NotificationPref, string][]
          ).map(([value, label], index) => {
            const active = notificationPref === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => onNotificationPrefChange(value)}
                style={[styles.optionRow, index > 0 && styles.rowBorder]}
              >
                <Text style={styles.settingTitle}>{label}</Text>
                <View style={[styles.radio, active && styles.radioActive]}>
                  {active ? <View style={styles.radioDot} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>ABOUT</Text>
        <View style={styles.card}>
          <Pressable
            accessibilityRole="button"
            onPress={onAbout}
            style={styles.optionRow}
          >
            <Text style={styles.settingTitle}>About this rebuild</Text>
            <Feather name="chevron-right" size={18} color={colors.faint} />
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={onSignOut}
          style={styles.signOutButton}
        >
          <Text style={styles.dangerText}>Sign out</Text>
        </Pressable>

        <Text style={styles.version}>
          Open Services rebuild · local PocketBase
        </Text>
      </ScrollView>
    </View>
  );
}
