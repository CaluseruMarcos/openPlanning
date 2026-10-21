import Feather from "@expo/vector-icons/Feather";
import { useMemo, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";

import { formatTimestamp } from "../api/pocketbase";
import { Avatar } from "../components/Avatar";
import { EmptyState, LoadingInline } from "../components/Feedback";
import { Logo } from "../components/Logo";
import { ScreenHeader } from "../components/ScreenHeader";
import { styles } from "../styles";
import { colors } from "../theme";
import type {
  Conversation,
  ConversationFilter,
  Person,
} from "../types";

export function ConversationListScreen({
  conversations,
  me,
  loading,
  query,
  filter,
  messageSearchIds,
  searchingMessages,
  onQueryChange,
  onFilterChange,
  onSelect,
  onProfile,
  onMarkAllRead,
  onCreate,
}: {
  conversations: Conversation[];
  me: Person;
  loading: boolean;
  query: string;
  filter: ConversationFilter;
  messageSearchIds: Record<string, boolean>;
  searchingMessages: boolean;
  onQueryChange: (value: string) => void;
  onFilterChange: (value: ConversationFilter) => void;
  onSelect: (conversation: Conversation) => void;
  onProfile: () => void;
  onMarkAllRead: () => void;
  onCreate: () => void;
}) {
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (filter === "unread" && conversation.unreadCount === 0) return false;
      if (filter === "teams" && conversation.kind !== "team") return false;
      if (!needle) return true;
      const haystack = [
        conversation.title,
        conversation.lastMessagePreview ?? "",
        ...conversation.participants.map((person) => person.name),
        ...conversation.messages.map((message) => message.body),
      ]
        .join(" ")
        .toLowerCase();
      return (
        haystack.includes(needle) || Boolean(messageSearchIds[conversation.id])
      );
    });
  }, [conversations, filter, messageSearchIds, query]);

  const unread = conversations.reduce(
    (total, conversation) => total + conversation.unreadCount,
    0,
  );
  const trimmedQuery = query.trim();
  const [searchFocused, setSearchFocused] = useState(false);

  return (
    <View style={styles.flex}>
      <ScreenHeader>
        <View style={styles.brandRow}>
          <View style={styles.brandLockup}>
            <Logo size={28} tone="paper" />
            <Text style={styles.wordmark}>Open Services</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New conversation"
              onPress={onCreate}
              style={({ pressed }) => [
                styles.newButton,
                pressed && styles.pressed,
              ]}
            >
              <Feather name="plus" size={14} color={colors.chrome} />
              <Text style={styles.newButtonText}>New</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open profile"
              onPress={onProfile}
            >
              <Avatar person={me} size={36} />
            </Pressable>
          </View>
        </View>
        <View style={styles.titleRow}>
          <Text style={styles.screenTitle}>Conversations</Text>
          <Text style={styles.screenMeta}>
            {unread > 0 ? `${unread} unread` : "No unread messages"}
          </Text>
        </View>
        <View style={[styles.searchBar, searchFocused && styles.searchBarFocused]}>
          <Feather
            name="search"
            size={16}
            color={colors.chromeSoft}
            style={styles.searchIcon}
          />
          <TextInput
            value={query}
            onChangeText={onQueryChange}
            placeholder="Search"
            placeholderTextColor={colors.chromeSoft}
            style={styles.searchInput}
            returnKeyType="search"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            accessibilityLabel="Search conversations"
          />
          {query.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => onQueryChange("")}
              style={styles.clearButton}
            >
              <Feather name="x" size={16} color={colors.chromeSoft} />
            </Pressable>
          ) : null}
        </View>
      </ScreenHeader>
      <View style={styles.filterBar}>
        <View style={styles.filterTabs}>
          {(
            [
              ["all", "All"],
              ["unread", "Unread"],
              ["teams", "Teams"],
            ] as [ConversationFilter, string][]
          ).map(([value, label]) => {
            const active = filter === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onFilterChange(value)}
                style={styles.filterTab}
              >
                <View style={styles.filterTabRow}>
                  <Text
                    style={active ? styles.filterTextActive : styles.filterText}
                  >
                    {label}
                  </Text>
                  {value === "unread" && unread > 0 ? (
                    <Text style={styles.filterCount}>{unread}</Text>
                  ) : null}
                </View>
                {active ? <View style={styles.filterMarker} /> : null}
              </Pressable>
            );
          })}
        </View>
        {searchingMessages && trimmedQuery && visible.length > 0 ? (
          <Text style={styles.filterStatus}>Searching…</Text>
        ) : unread > 0 && !trimmedQuery ? (
          <Pressable
            accessibilityRole="button"
            onPress={onMarkAllRead}
            hitSlop={8}
          >
            <Text style={styles.filterAction}>Mark all read</Text>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        style={styles.flex}
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          loading && conversations.length === 0 ? (
            <LoadingInline label="Loading conversations…" />
          ) : searchingMessages && trimmedQuery ? (
            <LoadingInline label="Searching messages…" />
          ) : (
            <EmptyState
              title={
                trimmedQuery
                  ? "No matches"
                  : filter === "unread"
                    ? "No unread conversations"
                    : "No conversations yet"
              }
              body={
                trimmedQuery
                  ? `Nothing matches “${trimmedQuery}”. Try a name or a message.`
                  : filter === "unread"
                    ? "New messages will show up here."
                    : "Start one with New."
              }
            />
          )
        }
        renderItem={({ item }) => {
          const preview = item.lastMessagePreview?.trim() || "No messages yet";
          const stamp = formatTimestamp(item.lastMessageAt);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.title}`}
              style={({ pressed }) => [
                styles.conversationRow,
                pressed && styles.pressed,
              ]}
              onPress={() => onSelect(item)}
            >
              {item.unreadCount > 0 ? <View style={styles.unreadBar} /> : null}
              <View style={styles.avatarStack}>
                <Avatar person={item.participants[0] ?? me} />
                {item.participants.length > 1 ? (
                  <View style={styles.smallAvatarWrap}>
                    <Avatar person={item.participants[1]} size={24} />
                  </View>
                ) : null}
              </View>
              <View style={styles.conversationCopy}>
                <View style={styles.rowTopLine}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.conversationTitle,
                      item.unreadCount > 0 && styles.unreadText,
                    ]}
                  >
                    {item.title}
                  </Text>
                  <Text style={styles.timestamp}>{stamp}</Text>
                </View>
                <View style={styles.rowBottomLine}>
                  <Text numberOfLines={1} style={styles.preview}>
                    {preview}
                  </Text>
                  {item.unreadCount > 0 ? (
                    <Text style={styles.badge}>{item.unreadCount}</Text>
                  ) : null}
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
