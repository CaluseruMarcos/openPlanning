import { Pressable, ScrollView, Text, View } from "react-native";

import { formatTimestamp } from "../api/pocketbase";
import { Avatar } from "../components/Avatar";
import { Logo } from "../components/Logo";
import { ScreenHeader } from "../components/ScreenHeader";
import { styles } from "../styles";
import type { Conversation, Person } from "../types";

export function ActivityScreen({
  conversations,
  me,
  onSelect,
}: {
  conversations: Conversation[];
  me: Person;
  onSelect: (conversation: Conversation) => void;
}) {
  const unreadItems = conversations.filter(
    (conversation) => conversation.unreadCount > 0,
  );
  const recent = conversations
    .filter((conversation) => Boolean(conversation.lastMessageAt))
    .slice(0, 20);

  function authorFor(conversation: Conversation): Person {
    if (conversation.lastMessageAuthorId === me.id) return me;
    return (
      conversation.participants.find(
        (person) => person.id === conversation.lastMessageAuthorId,
      ) ??
      conversation.participants[0] ??
      me
    );
  }

  function authorName(conversation: Conversation): string {
    if (conversation.lastMessageAuthorId === me.id) return "You";
    return authorFor(conversation).name;
  }

  return (
    <View style={styles.flex}>
      <ScreenHeader>
        <View style={styles.brandRow}>
          <View style={styles.brandLockup}>
            <Logo size={28} tone="paper" />
            <Text style={styles.wordmark}>Open Services</Text>
          </View>
        </View>
        <Text style={styles.screenTitle}>Activity</Text>
        <Text style={styles.screenMeta}>
          Recent activity from your conversations.
        </Text>
      </ScreenHeader>
      <ScrollView contentContainerStyle={styles.listContent}>
        <Text style={styles.sectionLabel}>NEEDS ATTENTION</Text>
        {unreadItems.length === 0 ? (
          <View style={styles.activityEmpty}>
            <Text style={styles.activityEmptyText}>You're all caught up.</Text>
          </View>
        ) : (
          unreadItems.map((conversation) => (
            <Pressable
              key={`unread-${conversation.id}`}
              accessibilityRole="button"
              onPress={() => onSelect(conversation)}
              style={({ pressed }) => [
                styles.activityRow,
                pressed && styles.pressed,
              ]}
            >
              <Avatar person={authorFor(conversation)} size={38} />
              <View style={styles.activityCopy}>
                <Text style={styles.activityTitle}>{conversation.title}</Text>
                <Text numberOfLines={2} style={styles.activityBody}>
                  <Text style={styles.activityAuthor}>
                    {authorName(conversation)}:{" "}
                  </Text>
                  {conversation.lastMessagePreview}
                </Text>
              </View>
              <Text style={styles.timestamp}>
                {formatTimestamp(conversation.lastMessageAt)}
              </Text>
            </Pressable>
          ))
        )}

        <Text style={styles.sectionLabel}>RECENT</Text>
        {recent.length === 0 ? (
          <View style={styles.activityEmpty}>
            <Text style={styles.activityEmptyText}>
              New messages will appear here.
            </Text>
          </View>
        ) : (
          recent.map((conversation) => (
            <Pressable
              key={`recent-${conversation.id}`}
              accessibilityRole="button"
              onPress={() => onSelect(conversation)}
              style={({ pressed }) => [
                styles.activityRow,
                pressed && styles.pressed,
              ]}
            >
              <Avatar person={authorFor(conversation)} size={38} />
              <View style={styles.activityCopy}>
                <Text style={styles.activityTitle}>{conversation.title}</Text>
                <Text numberOfLines={1} style={styles.activityBody}>
                  {conversation.lastMessagePreview}
                </Text>
              </View>
              <Text style={styles.timestamp}>
                {formatTimestamp(conversation.lastMessageAt)}
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}
