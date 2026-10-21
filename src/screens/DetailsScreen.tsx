import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "../components/Avatar";
import { Header } from "../components/Header";
import { styles } from "../styles";
import { colors } from "../theme";
import type { Conversation, Person } from "../types";

export function DetailsScreen({
  conversation,
  me,
  muted,
  canDelete,
  onBack,
  onToggleMute,
  onDelete,
}: {
  conversation: Conversation;
  me: Person;
  muted: boolean;
  canDelete: boolean;
  onBack: () => void;
  onToggleMute: (value: boolean) => void;
  onDelete: () => void;
}) {
  const insets = useSafeAreaInsets();
  const people = conversation.participants.some((person) => person.id === me.id)
    ? conversation.participants
    : [...conversation.participants, me];

  return (
    <View style={[styles.flex, { paddingBottom: insets.bottom }]}>
      <Header title="Details" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.detailsContent}>
        <View style={styles.detailsHero}>
          <Avatar person={conversation.participants[0] ?? me} size={56} />
          <View style={styles.flex}>
            <Text style={styles.detailsTitle}>{conversation.title}</Text>
            <Text style={styles.detailsSubtitle}>
              {conversation.kind === "direct"
                ? "Direct message"
                : conversation.kind === "team"
                  ? "Team conversation"
                  : "Group conversation"}
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>People</Text>
          <Text style={styles.sectionCount}>{people.length}</Text>
        </View>
        {people.map((person) => (
          <View key={person.id} style={styles.participantRow}>
            <Avatar person={person} size={38} />
            <Text style={styles.participantName}>{person.name}</Text>
            {person.id === me.id ? (
              <Text style={styles.participantTag}>You</Text>
            ) : null}
          </View>
        ))}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Notifications</Text>
        </View>
        <View style={styles.settingRow}>
          <View style={styles.flex}>
            <Text style={styles.settingTitle}>Mute notifications</Text>
            <Text style={styles.settingHint}>
              Pause alerts for this conversation only
            </Text>
          </View>
          <Switch
            value={muted}
            onValueChange={onToggleMute}
            trackColor={{ false: colors.lineStrong, true: colors.accent }}
            thumbColor={colors.paperBright}
            ios_backgroundColor={colors.lineStrong}
          />
        </View>

        {canDelete ? (
          <Pressable
            accessibilityRole="button"
            onPress={onDelete}
            style={styles.deleteButton}
          >
            <Text style={styles.dangerText}>Delete conversation</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}
