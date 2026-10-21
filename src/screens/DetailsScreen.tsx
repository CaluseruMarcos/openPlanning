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
  return (
    <View style={[styles.flex, { paddingBottom: insets.bottom }]}>
      <Header title="Details" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.detailsContent}>
        <View style={styles.detailsHero}>
          <Avatar person={conversation.participants[0] ?? me} size={64} />
          <Text style={styles.detailsTitle}>{conversation.title}</Text>
          <Text style={styles.detailsSubtitle}>
            {conversation.kind === "direct"
              ? "Direct message"
              : conversation.kind === "team"
                ? "Team conversation"
                : "Group conversation"}
          </Text>
        </View>

        <Text style={styles.sectionLabel}>PARTICIPANTS</Text>
        <View style={styles.card}>
          {conversation.participants.map((person, index) => (
            <View
              key={person.id}
              style={[styles.participantRow, index > 0 && styles.rowBorder]}
            >
              <Avatar person={person} size={38} />
              <Text style={styles.participantName}>{person.name}</Text>
            </View>
          ))}
          <View
            style={[
              styles.participantRow,
              conversation.participants.length > 0 && styles.rowBorder,
            ]}
          >
            <Avatar person={me} size={38} />
            <Text style={styles.participantName}>{me.name} (you)</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>PREFERENCES</Text>
        <View style={styles.card}>
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
              trackColor={{ false: colors.lineStrong, true: colors.infoTint }}
              thumbColor={muted ? colors.chrome : colors.paperBright}
            />
          </View>
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
