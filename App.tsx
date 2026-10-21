import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import {
  createDirectConversation,
  createMessage,
  describeError,
  fetchConversations,
  fetchMessages,
  fetchPeople,
  formatTimestamp,
  parsePocketBaseDate,
  POCKETBASE_URL,
  removeConversation,
  restoreSession,
  searchMessageConversations,
  signIn,
  signOut,
  signUp,
  subscribeToConversations,
  subscribeToMessages,
  toPersonFromSession,
} from "./src/api/pocketbase";
import {
  defaultPreferences,
  loadPreferences,
  savePreferences,
  type Preferences,
} from "./src/storage/preferencesStore";
import type {
  Conversation,
  Message,
  NotificationPref,
  Person,
} from "./src/types";

type Tab = "chat" | "activity" | "profile";
type Filter = "all" | "unread" | "teams";
type SheetName = "menu" | "attach" | "delete" | "about" | null;
type AuthMode = "signin" | "signup";
type Session = { user: Person; email: string };

const BRAND_PERSON: Person = {
  id: "open-services",
  name: "Open Services",
  initials: "OS",
  color: "#5B61D6",
};

function unreadForConversation(
  conversation: Conversation,
  readAt: Record<string, string>,
  currentUserId: string,
): number {
  if (!conversation.lastMessageAt) return 0;
  if (conversation.lastMessageAuthorId === currentUserId) return 0;

  const lastMessage = parsePocketBaseDate(conversation.lastMessageAt);
  if (!lastMessage) return 0;

  const read = parsePocketBaseDate(readAt[conversation.id]);
  return !read || lastMessage.getTime() > read.getTime() ? 1 : 0;
}

function applyUnread(
  conversations: Conversation[],
  readAt: Record<string, string>,
  currentUserId: string,
): Conversation[] {
  return conversations.map((conversation) => ({
    ...conversation,
    unreadCount: unreadForConversation(conversation, readAt, currentUserId),
  }));
}

function mergeMessage(messages: Message[], message: Message): Message[] {
  if (messages.some((item) => item.id === message.id)) return messages;
  return [...messages, message].sort((left, right) =>
    left.createdAtIso.localeCompare(right.createdAtIso),
  );
}

function Avatar({ person, size = 42 }: { person: Person; size?: number }) {
  return (
    <View
      style={[
        styles.avatar,
        {
          backgroundColor: person.color,
          height: size,
          width: size,
          borderRadius: size / 2,
        },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.34 }]}>
        {person.initials}
      </Text>
    </View>
  );
}

function Header({
  title,
  onBack,
  action,
}: {
  title: string;
  onBack?: () => void;
  action?: { label: string; onPress: () => void; accessibilityLabel: string };
}) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={onBack}
          style={styles.headerButton}
        >
          <Text style={styles.headerButtonText}>‹</Text>
        </Pressable>
      ) : (
        <View style={styles.headerButton} />
      )}
      <Text numberOfLines={1} style={styles.headerTitle}>
        {title}
      </Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.accessibilityLabel}
          onPress={action.onPress}
          style={styles.headerButton}
        >
          <Text style={styles.headerAction}>{action.label}</Text>
        </Pressable>
      ) : (
        <View style={styles.headerButton} />
      )}
    </View>
  );
}

function SheetRow({
  label,
  hint,
  destructive,
  chevron,
  onPress,
}: {
  label: string;
  hint?: string;
  destructive?: boolean;
  chevron?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
    >
      <View style={styles.flex}>
        <Text style={[styles.sheetRowText, destructive && styles.dangerText]}>
          {label}
        </Text>
        {hint ? <Text style={styles.sheetRowHint}>{hint}</Text> : null}
      </View>
      {chevron ? <Text style={styles.sheetChevron}>›</Text> : null}
    </Pressable>
  );
}

function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close menu"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{title}</Text>
          {children}
        </View>
      </View>
    </Modal>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>◎</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

function LoadingInline({ label }: { label: string }) {
  return (
    <View style={styles.loadingInline}>
      <ActivityIndicator color="#5B61D6" />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorBannerText}>{message}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={8}>
          <Text style={styles.errorRetry}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ConversationList({
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
  filter: Filter;
  messageSearchIds: Record<string, boolean>;
  searchingMessages: boolean;
  onQueryChange: (value: string) => void;
  onFilterChange: (value: Filter) => void;
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

  return (
    <View style={styles.flex}>
      <View style={styles.homeHeader}>
        <View>
          <Text style={styles.eyebrow}>PLANNING CENTER</Text>
          <Text style={styles.homeTitle}>Conversations</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open profile"
          onPress={onProfile}
          style={styles.profileButton}
        >
          <Avatar person={me} size={40} />
          <View style={styles.onlineDot} />
        </Pressable>
      </View>
      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          value={query}
          onChangeText={onQueryChange}
          placeholder="Search conversations"
          placeholderTextColor="#8D919C"
          style={styles.searchInput}
          returnKeyType="search"
          accessibilityLabel="Search conversations"
        />
        {query.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() => onQueryChange("")}
            style={styles.clearButton}
          >
            <Text style={styles.clearButtonText}>×</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.filterBar}>
        {(
          [
            ["all", "All"],
            ["unread", `Unread${unread > 0 ? ` · ${unread}` : ""}`],
            ["teams", "Teams"],
          ] as [Filter, string][]
        ).map(([value, label]) => {
          const active = filter === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onFilterChange(value)}
              style={active ? styles.filterPillActive : styles.filterPill}
            >
              <Text style={active ? styles.filterTextActive : styles.filterText}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <FlatList
        style={styles.flex}
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>
              {query.trim()
                ? searchingMessages
                  ? "SEARCHING…"
                  : "RESULTS"
                : "RECENT"}
            </Text>
            {unread > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={onMarkAllRead}
                hitSlop={8}
              >
                <Text style={styles.sectionAction}>Mark all read</Text>
              </Pressable>
            ) : (
              <Text style={styles.sectionMuted}>All read</Text>
            )}
          </View>
        }
        ListEmptyComponent={
          loading && conversations.length === 0 ? (
            <LoadingInline label="Loading conversations…" />
          ) : (
            <EmptyState
              title={
                query.trim()
                  ? "No matches"
                  : filter === "unread"
                    ? "You're all caught up"
                    : "No conversations yet"
              }
              body={
                query.trim()
                  ? `Nothing matches “${query.trim()}”. Try a person, team, or message.`
                  : filter === "unread"
                    ? "Unread conversations will appear here."
                    : "Tap + to start a conversation."
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
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.preview,
                      item.unreadCount > 0 && styles.unreadText,
                    ]}
                  >
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New conversation"
        style={styles.composeButton}
        onPress={onCreate}
      >
        <Text style={styles.composeButtonText}>＋</Text>
      </Pressable>
    </View>
  );
}

function NewConversationView({
  me,
  people,
  loading,
  busy,
  onBack,
  onPick,
}: {
  me: Person;
  people: Person[];
  loading: boolean;
  busy: boolean;
  onBack: () => void;
  onPick: (person: Person) => void;
}) {
  const insets = useSafeAreaInsets();
  const available = people.filter((person) => person.id !== me.id);

  return (
    <View style={[styles.flex, { paddingBottom: insets.bottom }]}>
      <Header title="New message" onBack={onBack} />
      {busy ? (
        <LoadingInline label="Creating conversation…" />
      ) : (
        <FlatList
          data={available}
          keyExtractor={(person) => person.id}
          contentContainerStyle={styles.newMessageContent}
          ListHeaderComponent={
            <View>
              <Text style={styles.sectionLabel}>TO</Text>
              <Text style={styles.newMessageHint}>
                Choose a person to message.
              </Text>
              {loading ? <LoadingInline label="Loading people…" /> : null}
            </View>
          }
          ListEmptyComponent={
            loading ? null : (
              <EmptyState
                title="No teammates yet"
                body="Create another account or run the seed script to start a conversation."
              />
            )
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Message ${item.name}`}
              onPress={() => onPick(item)}
              style={({ pressed }) => [
                styles.personRow,
                pressed && styles.pressed,
              ]}
            >
              <Avatar person={item} size={42} />
              <View style={styles.flex}>
                <Text style={styles.personName}>{item.name}</Text>
                <Text style={styles.personHint}>Direct message</Text>
              </View>
              <Text style={styles.sheetChevron}>›</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function ConversationView({
  conversation,
  me,
  loading,
  error,
  sending,
  onBack,
  onSend,
  onDetails,
  onOpenMenu,
  onAttach,
}: {
  conversation: Conversation;
  me: Person;
  loading: boolean;
  error: string | null;
  sending: boolean;
  onBack: () => void;
  onSend: (body: string) => Promise<boolean>;
  onDetails: () => void;
  onOpenMenu: () => void;
  onAttach: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState("");
  const listRef = useRef<FlatList<Message>>(null);

  const canSend = draft.trim().length > 0 && !sending;

  async function submit() {
    if (!canSend) return;
    const body = draft.trim();
    setDraft("");
    const sent = await onSend(body);
    if (!sent) setDraft(body);
  }

  const participantNames = conversation.participants
    .map((person) => person.name)
    .join(", ");

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.flex, { paddingBottom: insets.bottom }]}
      keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
    >
      <Header
        title={conversation.title}
        onBack={onBack}
        action={{
          label: "⋯",
          onPress: onOpenMenu,
          accessibilityLabel: "Conversation options",
        }}
      />
      <Pressable
        accessibilityRole="button"
        onPress={onDetails}
        style={styles.conversationSubheader}
      >
        <Text style={styles.subheaderText}>
          {conversation.participants.length + 1} participants
        </Text>
        <Text style={styles.subheaderAction}>Details ›</Text>
      </Pressable>
      <FlatList
        ref={listRef}
        style={styles.flex}
        data={conversation.messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.messageList,
          conversation.messages.length === 0 && styles.flex,
        ]}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          loading ? (
            <LoadingInline label="Loading messages…" />
          ) : (
            <EmptyState
              title="No messages yet"
              body={
                participantNames
                  ? `This is the beginning of your conversation with ${participantNames}.`
                  : "Send the first message to start the conversation."
              }
            />
          )
        }
        renderItem={({ item }) => {
          const mine = item.author.id === me.id;
          return (
            <View style={[styles.messageRow, mine && styles.messageRowMine]}>
              <Avatar person={item.author} size={34} />
              <View style={[styles.messageBody, mine && styles.messageBodyMine]}>
                <View style={[styles.messageMeta, mine && styles.messageMetaMine]}>
                  <Text style={styles.messageAuthor}>
                    {mine ? "You" : item.author.name}
                  </Text>
                  <Text style={styles.timestamp}>{item.createdAt}</Text>
                </View>
                <View
                  style={[
                    styles.messageBubble,
                    mine && styles.messageBubbleMine,
                  ]}
                >
                  <Text
                    style={[
                      styles.messageText,
                      mine && styles.messageTextMine,
                    ]}
                  >
                    {item.body}
                  </Text>
                </View>
              </View>
            </View>
          );
        }}
      />
      {error ? (
        <View style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>{error}</Text>
        </View>
      ) : null}
      <View style={styles.composer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add attachment"
          style={styles.attachmentButton}
          onPress={onAttach}
        >
          <Text style={styles.attachmentText}>＋</Text>
        </Pressable>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Write a message..."
          placeholderTextColor="#8D919C"
          style={styles.composerInput}
          multiline
          accessibilityLabel="Message"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={submit}
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
        >
          {sending ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={styles.sendText}>↑</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function DetailsView({
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
          <Avatar
            person={conversation.participants[0] ?? me}
            size={64}
          />
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
              trackColor={{ false: "#D6D8E0", true: "#B9BCF0" }}
              thumbColor={muted ? "#5B61D6" : "#F7F7F9"}
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

function ActivityView({
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
      ) ?? conversation.participants[0] ?? me
    );
  }

  function authorName(conversation: Conversation): string {
    if (conversation.lastMessageAuthorId === me.id) return "You";
    return authorFor(conversation).name;
  }

  return (
    <View style={styles.flex}>
      <View style={styles.simpleHeader}>
        <Text style={styles.eyebrow}>PLANNING CENTER</Text>
        <Text style={styles.homeTitle}>Activity</Text>
      </View>
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

function ProfileView({
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
      <View style={styles.simpleHeader}>
        <Text style={styles.eyebrow}>PLANNING CENTER</Text>
        <Text style={styles.homeTitle}>Profile</Text>
      </View>
      <ScrollView contentContainerStyle={styles.profileContent}>
        <View style={styles.profileCard}>
          <Avatar person={session.user} size={56} />
          <View style={styles.flex}>
            <Text style={styles.profileName}>{session.user.name}</Text>
            <Text style={styles.profileSubtitle}>
              {session.email || "Email account"}
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{conversations.length}</Text>
            <Text style={styles.statLabel}>Conversations</Text>
          </View>
          <View style={styles.statCard}>
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
            <Text style={styles.sheetChevron}>›</Text>
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

function SignInView({
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

function BottomTabs({
  tab,
  unread,
  onChange,
}: {
  tab: Tab;
  unread: number;
  onChange: (tab: Tab) => void;
}) {
  const insets = useSafeAreaInsets();
  const items: [Tab, string, string][] = [
    ["chat", "▤", "Chat"],
    ["activity", "◷", "Activity"],
    ["profile", "◎", "Profile"],
  ];

  return (
    <View style={[styles.bottomTabs, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {items.map(([value, icon, label]) => {
        const active = tab === value;
        return (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={label}
            onPress={() => onChange(value)}
            style={styles.tab}
          >
            <View style={styles.tabIconWrap}>
              <Text style={[styles.tabIcon, active && styles.tabIconActive]}>
                {icon}
              </Text>
              {value === "chat" && unread > 0 ? (
                <Text style={styles.tabBadge}>{unread}</Text>
              ) : null}
            </View>
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function AppShell() {
  const insets = useSafeAreaInsets();
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [preferences, setPreferences] =
    useState<Preferences>(defaultPreferences);
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchingMessages, setSearchingMessages] = useState(false);
  const [messageSearchIds, setMessageSearchIds] = useState<
    Record<string, boolean>
  >({});
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [sending, setSending] = useState(false);

  const [tab, setTab] = useState<Tab>("chat");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<SheetName>(null);

  const userId = session?.user.id ?? "";
  const readAt = preferences.readAtByUser[userId] ?? {};
  const mutedIds = preferences.mutedByUser[userId] ?? {};
  const notificationPref =
    preferences.notificationPrefByUser[userId] ?? "all";

  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const conversationsRef = useRef<Conversation[]>([]);
  conversationsRef.current = conversations;
  const readAtRef = useRef<Record<string, string>>({});
  readAtRef.current = readAt;
  const markReadRef = useRef<(conversationId: string) => void>(() => undefined);
  const messageRequestRef = useRef(0);

  useEffect(() => {
    let active = true;

    (async () => {
      const stored = await loadPreferences().catch(() => defaultPreferences);
      if (!active) return;
      setPreferences(stored);
      setPreferencesHydrated(true);

      const user = await restoreSession();
      if (!active) return;
      if (!user) {
        setBooting(false);
        return;
      }

      setSession({ user: toPersonFromSession(user), email: user.email });
      await loadWorkspace(user.id, stored.readAtByUser[user.id] ?? {});
      if (active) setBooting(false);
    })();

    return () => {
      active = false;
    };
    // The boot sequence runs once; loadWorkspace only touches state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!preferencesHydrated) return;
    void savePreferences(preferences).catch(() => undefined);
  }, [preferences, preferencesHydrated]);

  useEffect(() => {
    const needle = query.trim();
    if (!session || needle.length < 2) {
      setMessageSearchIds({});
      setSearchingMessages(false);
      return undefined;
    }

    let cancelled = false;
    setSearchingMessages(true);
    const timeout = setTimeout(async () => {
      try {
        const ids = await searchMessageConversations(needle);
        if (!cancelled) {
          setMessageSearchIds(
            Object.fromEntries(ids.map((id) => [id, true])),
          );
        }
      } catch {
        if (!cancelled) setMessageSearchIds({});
      } finally {
        if (!cancelled) setSearchingMessages(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, session?.user.id]);

  useEffect(() => {
    if (Platform.OS !== "android") return undefined;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (sheet) {
          setSheet(null);
          return true;
        }
        if (composing) {
          setComposing(false);
          return true;
        }
        if (detailsId) {
          setSelectedId(detailsId);
          setDetailsId(null);
          return true;
        }
        if (selectedId) {
          setSelectedId(null);
          return true;
        }
        if (tab !== "chat") {
          setTab("chat");
          return true;
        }
        return false;
      },
    );
    return () => subscription.remove();
  }, [composing, detailsId, selectedId, sheet, tab]);

  useEffect(() => {
    if (selectedId && !conversations.some((item) => item.id === selectedId)) {
      setSelectedId(null);
    }
    if (detailsId && !conversations.some((item) => item.id === detailsId)) {
      setDetailsId(null);
    }
  }, [conversations, detailsId, selectedId]);

  useEffect(() => {
    if (!session) return undefined;
    const currentUserId = session.user.id;
    let disposed = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribeMessages: (() => Promise<void>) | null = null;
    let unsubscribeConversations: (() => Promise<void>) | null = null;

    const refreshConversations = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(async () => {
        try {
          const next = await fetchConversations(currentUserId);
          if (disposed) return;
          setConversations((current) => {
            const cached = new Map(
              current.map((conversation) => [
                conversation.id,
                conversation.messages,
              ]),
            );
            return applyUnread(
              next.map((conversation) => ({
                ...conversation,
                messages: cached.get(conversation.id) ?? [],
              })),
              readAtRef.current,
              currentUserId,
            );
          });
        } catch {
          // Realtime refresh is best-effort; keep the last known list.
        }
      }, 300);
    };

    void subscribeToMessages((event) => {
      if (disposed) return;

      if (event.action === "delete") {
        const deletedId = event.record?.id;
        if (deletedId) {
          setConversations((current) =>
            current.map((conversation) => ({
              ...conversation,
              messages: conversation.messages.filter(
                (message) => message.id !== deletedId,
              ),
            })),
          );
        }
        refreshConversations();
        return;
      }

      const message = event.message;
      if (!message) return;
      const conversationId = message.conversationId;

      if (
        !conversationsRef.current.some(
          (conversation) => conversation.id === conversationId,
        )
      ) {
        refreshConversations();
        return;
      }

      const isSelected = selectedIdRef.current === conversationId;
      const isMine = message.author.id === currentUserId;

      setConversations((current) =>
        current.map((conversation) => {
          if (conversation.id !== conversationId) return conversation;
          return {
            ...conversation,
            messages: isSelected
              ? mergeMessage(conversation.messages, message)
              : conversation.messages,
            lastMessagePreview: message.body,
            lastMessageAt: message.createdAtIso,
            lastMessageAuthorId: message.author.id,
            unreadCount: isSelected || isMine ? 0 : 1,
          };
        }),
      );

      if (isSelected) markReadRef.current(conversationId);
    })
      .then((unsubscribe) => {
        if (disposed) void unsubscribe();
        else unsubscribeMessages = unsubscribe;
      })
      .catch(() => undefined);

    void subscribeToConversations((event) => {
      if (disposed) return;
      if (event.action === "delete") {
        const id = event.record?.id;
        if (id) {
          setConversations((current) =>
            current.filter((conversation) => conversation.id !== id),
          );
        }
        return;
      }
      refreshConversations();
    })
      .then((unsubscribe) => {
        if (disposed) void unsubscribe();
        else unsubscribeConversations = unsubscribe;
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (unsubscribeMessages) {
        void unsubscribeMessages().catch(() => undefined);
      }
      if (unsubscribeConversations) {
        void unsubscribeConversations().catch(() => undefined);
      }
    };
  }, [session?.user.id]);

  async function loadWorkspace(
    currentUserId: string,
    readMap: Record<string, string>,
  ) {
    setLoadingWorkspace(true);
    setDataError(null);
    try {
      const [nextConversations, nextPeople] = await Promise.all([
        fetchConversations(currentUserId),
        fetchPeople(currentUserId),
      ]);
      setConversations(applyUnread(nextConversations, readMap, currentUserId));
      setPeople(nextPeople);
    } catch (error) {
      setDataError(describeError(error));
    } finally {
      setLoadingWorkspace(false);
    }
  }

  function markRead(conversationId: string) {
    if (!session) return;
    const currentUserId = session.user.id;
    const now = new Date().toISOString();

    setPreferences((current) => {
      const reads = current.readAtByUser[currentUserId] ?? {};
      return {
        ...current,
        readAtByUser: {
          ...current.readAtByUser,
          [currentUserId]: { ...reads, [conversationId]: now },
        },
      };
    });

    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              unreadCount: 0,
              messages: conversation.messages.map((message) => ({
                ...message,
                unread: false,
              })),
            }
          : conversation,
      ),
    );
  }
  markReadRef.current = markRead;

  async function openConversation(conversation: Conversation) {
    const conversationId = conversation.id;
    const requestId = messageRequestRef.current + 1;
    messageRequestRef.current = requestId;

    setComposing(false);
    setSelectedId(conversationId);
    setTab("chat");
    markRead(conversationId);
    setMessageError(null);
    setLoadingMessages(true);

    try {
      const messages = await fetchMessages(conversationId);
      if (messageRequestRef.current !== requestId) return;
      setConversations((current) =>
        current.map((item) =>
          item.id === conversationId ? { ...item, messages } : item,
        ),
      );
    } catch (error) {
      if (messageRequestRef.current === requestId) {
        setMessageError(describeError(error));
      }
    } finally {
      if (messageRequestRef.current === requestId) {
        setLoadingMessages(false);
      }
    }
  }

  async function sendMessage(body: string): Promise<boolean> {
    if (!selectedId || !session) return false;
    const conversationId = selectedId;
    const author = session.user;

    setSending(true);
    setMessageError(null);

    try {
      const created = await createMessage(conversationId, author.id, body);
      const message = { ...created, author };
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                messages: mergeMessage(conversation.messages, message),
                lastMessagePreview: body,
                lastMessageAt: message.createdAtIso,
                lastMessageAuthorId: author.id,
                unreadCount: 0,
              }
            : conversation,
        ),
      );
      markRead(conversationId);
      return true;
    } catch (error) {
      setMessageError(describeError(error));
      return false;
    } finally {
      setSending(false);
    }
  }

  async function startConversation(person: Person) {
    if (!session) return;

    const existing = conversations.find(
      (conversation) =>
        conversation.kind === "direct" &&
        conversation.participants.length === 1 &&
        conversation.participants[0].id === person.id,
    );

    setComposing(false);
    if (existing) {
      void openConversation(existing);
      return;
    }

    setCreatingConversation(true);
    setDataError(null);
    try {
      const conversation = await createDirectConversation(person, session.user);
      setConversations((current) => [conversation, ...current]);
      setQuery("");
      setFilter("all");
      await openConversation(conversation);
    } catch (error) {
      setDataError(describeError(error));
    } finally {
      setCreatingConversation(false);
    }
  }

  function markAllRead() {
    if (!session) return;
    const currentUserId = session.user.id;
    const now = new Date().toISOString();

    setPreferences((current) => {
      const reads = { ...(current.readAtByUser[currentUserId] ?? {}) };
      for (const conversation of conversations) {
        reads[conversation.id] = now;
      }
      return {
        ...current,
        readAtByUser: {
          ...current.readAtByUser,
          [currentUserId]: reads,
        },
      };
    });

    setConversations((current) =>
      current.map((conversation) => ({
        ...conversation,
        unreadCount: 0,
        messages: conversation.messages.map((message) => ({
          ...message,
          unread: false,
        })),
      })),
    );
  }

  function markUnread() {
    if (!selectedId || !session) return;
    const conversationId = selectedId;
    const currentUserId = session.user.id;

    setPreferences((current) => {
      const reads = { ...(current.readAtByUser[currentUserId] ?? {}) };
      delete reads[conversationId];
      return {
        ...current,
        readAtByUser: {
          ...current.readAtByUser,
          [currentUserId]: reads,
        },
      };
    });

    setConversations((current) =>
      current.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        const unread =
          conversation.lastMessageAuthorId &&
          conversation.lastMessageAuthorId !== currentUserId
            ? 1
            : 0;
        return {
          ...conversation,
          unreadCount: unread,
          messages: conversation.messages.map((message, index) =>
            index === conversation.messages.length - 1
              ? { ...message, unread: true }
              : message,
          ),
        };
      }),
    );

    setSelectedId(null);
    setSheet(null);
  }

  async function deleteConversation(conversationId: string) {
    if (!session) return;
    const currentUserId = session.user.id;
    setDataError(null);

    try {
      await removeConversation(conversationId);
      setConversations((current) =>
        current.filter((conversation) => conversation.id !== conversationId),
      );
      setPreferences((current) => {
        const reads = { ...(current.readAtByUser[currentUserId] ?? {}) };
        delete reads[conversationId];
        return {
          ...current,
          readAtByUser: {
            ...current.readAtByUser,
            [currentUserId]: reads,
          },
        };
      });
      setSelectedId(null);
      setDetailsId(null);
      setSheet(null);
    } catch (error) {
      setDataError(describeError(error));
      setSheet(null);
    }
  }

  async function refreshPeople() {
    if (!session) return;
    setLoadingPeople(true);
    try {
      setPeople(await fetchPeople(session.user.id));
    } catch (error) {
      setDataError(describeError(error));
    } finally {
      setLoadingPeople(false);
    }
  }

  function openCompose() {
    setComposing(true);
    setMessageError(null);
    void refreshPeople();
  }

  function toggleMute(conversationId: string, value: boolean) {
    if (!session) return;
    const currentUserId = session.user.id;
    setPreferences((current) => ({
      ...current,
      mutedByUser: {
        ...current.mutedByUser,
        [currentUserId]: {
          ...(current.mutedByUser[currentUserId] ?? {}),
          [conversationId]: value,
        },
      },
    }));
  }

  function changeNotificationPref(value: NotificationPref) {
    if (!session) return;
    const currentUserId = session.user.id;
    setPreferences((current) => ({
      ...current,
      notificationPrefByUser: {
        ...current.notificationPrefByUser,
        [currentUserId]: value,
      },
    }));
  }

  async function handleAuth(
    mode: AuthMode,
    values: { name: string; email: string; password: string },
  ) {
    setAuthBusy(true);
    setAuthError(null);

    try {
      const user =
        mode === "signin"
          ? await signIn(values.email, values.password)
          : await signUp(values.name, values.email, values.password);

      setSession({ user: toPersonFromSession(user), email: user.email });
      await loadWorkspace(
        user.id,
        preferences.readAtByUser[user.id] ?? {},
      );
    } catch (error) {
      setAuthError(describeError(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    setSession(null);
    setConversations([]);
    setPeople([]);
    setSelectedId(null);
    setDetailsId(null);
    setComposing(false);
    setTab("chat");
    setQuery("");
    setMessageSearchIds({});
    setSearchingMessages(false);
    setSheet(null);
    setAuthError(null);
    setDataError(null);
    setMessageError(null);
  }

  function retryWorkspace() {
    if (session) {
      void loadWorkspace(session.user.id, readAtRef.current);
    }
  }

  function addAttachmentMessage(label: string) {
    setSheet(null);
    void sendMessage(
      `${label} attachment — previews are not connected in this build yet.`,
    );
  }

  const contentStyle = { paddingTop: insets.top };
  const selectedConversation =
    conversations.find((conversation) => conversation.id === selectedId) ??
    null;
  const detailsConversation =
    conversations.find((conversation) => conversation.id === detailsId) ?? null;
  const unread = conversations.reduce(
    (total, conversation) => total + conversation.unreadCount,
    0,
  );

  if (booting) {
    return (
      <View style={styles.app}>
        <StatusBar style="dark" />
        <View style={styles.centered}>
          <ActivityIndicator color="#5B61D6" size="large" />
          <Text style={styles.loadingText}>Starting Open Services…</Text>
        </View>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.app}>
        <StatusBar style="dark" />
        <SignInView
          busy={authBusy}
          error={authError}
          serverUrl={POCKETBASE_URL}
          onSubmit={handleAuth}
          onClearError={() => setAuthError(null)}
        />
      </View>
    );
  }

  const conversationMuted = selectedId
    ? Boolean(mutedIds[selectedId])
    : false;
  const selectedCanDelete =
    selectedConversation?.createdBy === session.user.id;
  const detailsCanDelete = detailsConversation?.createdBy === session.user.id;

  return (
    <View style={styles.app}>
      <StatusBar style="dark" />
      <View style={[styles.flex, contentStyle]}>
        {dataError ? (
          <ErrorBanner message={dataError} onRetry={retryWorkspace} />
        ) : null}
        {selectedConversation ? (
          <ConversationView
            conversation={selectedConversation}
            me={session.user}
            loading={loadingMessages}
            error={messageError}
            sending={sending}
            onBack={() => setSelectedId(null)}
            onSend={sendMessage}
            onDetails={() => {
              setDetailsId(selectedConversation.id);
              setSelectedId(null);
            }}
            onOpenMenu={() => setSheet("menu")}
            onAttach={() => setSheet("attach")}
          />
        ) : detailsConversation ? (
          <DetailsView
            conversation={detailsConversation}
            me={session.user}
            muted={Boolean(mutedIds[detailsConversation.id])}
            canDelete={Boolean(detailsCanDelete)}
            onBack={() => {
              setSelectedId(detailsConversation.id);
              setDetailsId(null);
            }}
            onToggleMute={(value) =>
              toggleMute(detailsConversation.id, value)
            }
            onDelete={() => setSheet("delete")}
          />
        ) : composing ? (
          <NewConversationView
            me={session.user}
            people={people}
            loading={loadingPeople}
            busy={creatingConversation}
            onBack={() => setComposing(false)}
            onPick={(person) => void startConversation(person)}
          />
        ) : tab === "activity" ? (
          <ActivityView
            conversations={conversations}
            me={session.user}
            onSelect={(conversation) => void openConversation(conversation)}
          />
        ) : tab === "profile" ? (
          <ProfileView
            session={session}
            conversations={conversations}
            notificationPref={notificationPref}
            onNotificationPrefChange={changeNotificationPref}
            onAbout={() => setSheet("about")}
            onSignOut={() => void handleSignOut()}
          />
        ) : (
          <ConversationList
            conversations={conversations}
            me={session.user}
            loading={loadingWorkspace}
            query={query}
            filter={filter}
            messageSearchIds={messageSearchIds}
            searchingMessages={searchingMessages}
            onQueryChange={setQuery}
            onFilterChange={setFilter}
            onSelect={(conversation) => void openConversation(conversation)}
            onProfile={() => setTab("profile")}
            onMarkAllRead={markAllRead}
            onCreate={openCompose}
          />
        )}
      </View>
      {selectedConversation || detailsConversation || composing ? null : (
        <BottomTabs
          tab={tab}
          unread={unread}
          onChange={(nextTab) => {
            setTab(nextTab);
            setSelectedId(null);
            setDetailsId(null);
            setComposing(false);
          }}
        />
      )}

      {selectedConversation ? (
        <>
          <Sheet
            visible={sheet === "menu"}
            title={selectedConversation.title}
            onClose={() => setSheet(null)}
          >
            <SheetRow
              label="View details"
              chevron
              onPress={() => {
                setSheet(null);
                setDetailsId(selectedConversation.id);
                setSelectedId(null);
              }}
            />
            <SheetRow
              label={
                conversationMuted ? "Unmute notifications" : "Mute notifications"
              }
              hint={
                conversationMuted
                  ? "Alerts are currently paused"
                  : "Pause alerts for this conversation"
              }
              onPress={() => {
                toggleMute(selectedConversation.id, !conversationMuted);
                setSheet(null);
              }}
            />
            <SheetRow label="Mark as unread" onPress={markUnread} />
            {selectedCanDelete ? (
              <SheetRow
                label="Delete conversation"
                destructive
                onPress={() => setSheet("delete")}
              />
            ) : null}
            <SheetRow label="Cancel" onPress={() => setSheet(null)} />
          </Sheet>

          <Sheet
            visible={sheet === "attach"}
            title="Add attachment"
            onClose={() => setSheet(null)}
          >
            <SheetRow
              label="Photo"
              hint="Sends a text placeholder"
              onPress={() => addAttachmentMessage("Photo")}
            />
            <SheetRow
              label="File"
              hint="Sends a text placeholder"
              onPress={() => addAttachmentMessage("File")}
            />
            <SheetRow label="Cancel" onPress={() => setSheet(null)} />
          </Sheet>
        </>
      ) : null}

      <Sheet
        visible={sheet === "delete"}
        title="Delete this conversation?"
        onClose={() => setSheet(null)}
      >
        <Text style={styles.sheetBody}>
          This removes the conversation and its messages for every participant.
          This cannot be undone.
        </Text>
        <SheetRow
          label="Delete conversation"
          destructive
          onPress={() => {
            const id = selectedConversation?.id ?? detailsConversation?.id;
            if (id) void deleteConversation(id);
          }}
        />
        <SheetRow label="Cancel" onPress={() => setSheet(null)} />
      </Sheet>

      <Sheet
        visible={sheet === "about"}
        title="About this rebuild"
        onClose={() => setSheet(null)}
      >
        <Text style={styles.sheetBody}>
          Open Services is an Expo rebuild of the Planning Center Services chat
          surface. Conversations and messages are stored in a self-hosted
          PocketBase backend and sync in realtime between signed-in accounts.
        </Text>
        <Text style={styles.sheetBodyMuted}>
          Version 0.1.0 · Expo 57 · React Native 0.86 · PocketBase 0.40
        </Text>
        <SheetRow label="Close" onPress={() => setSheet(null)} />
      </Sheet>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppShell />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  app: { backgroundColor: "#F7F7F9", flex: 1 },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  centered: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
  },
  loadingInline: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  loadingText: { color: "#858995", fontSize: 13 },
  errorBanner: {
    alignItems: "center",
    backgroundColor: "#FDECEC",
    borderColor: "#F3C9C9",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorBannerText: { color: "#8E3B3B", flex: 1, fontSize: 13, lineHeight: 18 },
  errorRetry: { color: "#B23B3B", fontSize: 13, fontWeight: "700" },
  inlineError: {
    backgroundColor: "#FDECEC",
    borderRadius: 10,
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inlineErrorText: { color: "#8E3B3B", fontSize: 12, lineHeight: 17 },
  header: {
    alignItems: "center",
    backgroundColor: "#F7F7F9",
    flexDirection: "row",
    height: 58,
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  headerButton: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    minWidth: 42,
  },
  headerButtonText: {
    color: "#272B36",
    fontSize: 38,
    fontWeight: "300",
    lineHeight: 40,
  },
  headerAction: { color: "#5B61D6", fontSize: 22 },
  headerTitle: {
    color: "#20232B",
    flex: 1,
    fontSize: 19,
    fontWeight: "700",
    textAlign: "center",
  },
  homeHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 18,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  simpleHeader: { paddingBottom: 14, paddingHorizontal: 20, paddingTop: 12 },
  eyebrow: {
    color: "#747B91",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  homeTitle: {
    color: "#1D2130",
    fontSize: 29,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  profileButton: { position: "relative" },
  onlineDot: {
    backgroundColor: "#46B48A",
    borderColor: "#F7F7F9",
    borderRadius: 6,
    borderWidth: 2,
    bottom: 0,
    height: 12,
    position: "absolute",
    right: -1,
    width: 12,
  },
  searchBox: {
    alignItems: "center",
    backgroundColor: "#FFF",
    borderColor: "#E3E4EA",
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: "row",
    marginHorizontal: 16,
    paddingHorizontal: 12,
  },
  searchIcon: { color: "#747986", fontSize: 24, marginRight: 6 },
  searchInput: { color: "#252832", flex: 1, fontSize: 16, height: 42 },
  clearButton: {
    alignItems: "center",
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  clearButtonText: { color: "#8A8E99", fontSize: 22, lineHeight: 24 },
  filterBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  filterPill: {
    borderColor: "#E0E1E8",
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 17,
    paddingVertical: 8,
  },
  filterPillActive: {
    backgroundColor: "#252A42",
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  filterText: { color: "#6D7281", fontSize: 13, fontWeight: "600" },
  filterTextActive: { color: "#FFF", fontSize: 13, fontWeight: "700" },
  listContent: { paddingBottom: 110, paddingHorizontal: 20 },
  newMessageContent: { paddingBottom: 32, paddingHorizontal: 16 },
  newMessageHint: { color: "#858995", fontSize: 13, marginBottom: 14 },
  personRow: {
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 14,
    flexDirection: "row",
    gap: 12,
    marginBottom: 9,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  personName: { color: "#252832", fontSize: 16, fontWeight: "600" },
  personHint: { color: "#8A8E99", fontSize: 12, marginTop: 2 },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  sectionLabel: {
    color: "#858995",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginBottom: 8,
    marginTop: 14,
  },
  sectionAction: {
    color: "#5B61D6",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  sectionMuted: {
    color: "#A0A3AC",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  conversationRow: {
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 16,
    flexDirection: "row",
    marginBottom: 9,
    minHeight: 82,
    paddingHorizontal: 12,
  },
  avatarStack: { height: 48, marginRight: 12, width: 50 },
  smallAvatarWrap: { bottom: 0, position: "absolute", right: 0 },
  avatar: { alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFF", fontWeight: "700" },
  conversationCopy: { flex: 1, paddingVertical: 13 },
  rowTopLine: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  rowBottomLine: {
    alignItems: "center",
    flexDirection: "row",
    marginTop: 4,
  },
  conversationTitle: {
    color: "#252832",
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    marginRight: 8,
  },
  unreadText: { fontWeight: "800" },
  timestamp: { color: "#8A8E99", fontSize: 12 },
  preview: { color: "#737783", flex: 1, fontSize: 14, marginRight: 8 },
  badge: {
    backgroundColor: "#5B61D6",
    borderRadius: 12,
    color: "#FFF",
    fontSize: 12,
    fontWeight: "700",
    minWidth: 24,
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 3,
    textAlign: "center",
  },
  composeButton: {
    alignItems: "center",
    backgroundColor: "#5B61D6",
    borderRadius: 29,
    bottom: 24,
    elevation: 5,
    height: 58,
    justifyContent: "center",
    position: "absolute",
    right: 22,
    shadowColor: "#3E428F",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    width: 58,
  },
  composeButtonText: {
    color: "#FFF",
    fontSize: 30,
    fontWeight: "300",
    marginTop: -3,
  },
  bottomTabs: {
    alignItems: "center",
    backgroundColor: "#FFF",
    borderTopColor: "#E6E6EB",
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 8,
  },
  tab: {
    alignItems: "center",
    gap: 2,
    justifyContent: "center",
    minHeight: 46,
    width: 80,
  },
  tabIconWrap: { alignItems: "center", justifyContent: "center" },
  tabIcon: { color: "#A0A4B0", fontSize: 20, lineHeight: 24 },
  tabIconActive: { color: "#5B61D6" },
  tabBadge: {
    backgroundColor: "#5B61D6",
    borderRadius: 8,
    color: "#FFF",
    fontSize: 9,
    fontWeight: "800",
    minWidth: 16,
    overflow: "hidden",
    paddingHorizontal: 4,
    paddingVertical: 1,
    position: "absolute",
    right: -10,
    textAlign: "center",
    top: -2,
  },
  tabLabel: { color: "#9296A2", fontSize: 11, fontWeight: "600" },
  tabLabelActive: { color: "#5B61D6", fontSize: 11, fontWeight: "700" },
  conversationSubheader: {
    alignItems: "center",
    borderBottomColor: "#E4E4E9",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 12,
    paddingHorizontal: 18,
  },
  subheaderText: { color: "#858995", fontSize: 12 },
  subheaderAction: { color: "#5B61D6", fontSize: 12, fontWeight: "700" },
  messageList: { padding: 18 },
  messageRow: { flexDirection: "row", marginBottom: 22 },
  messageRowMine: { flexDirection: "row-reverse" },
  messageBody: { flex: 1, marginLeft: 10 },
  messageBodyMine: { marginLeft: 0, marginRight: 10 },
  messageMeta: { alignItems: "center", flexDirection: "row", gap: 8 },
  messageMetaMine: { justifyContent: "flex-end" },
  messageAuthor: { color: "#252832", fontSize: 14, fontWeight: "700" },
  messageBubble: {
    backgroundColor: "#FFF",
    borderBottomLeftRadius: 4,
    borderRadius: 16,
    marginTop: 6,
    maxWidth: "92%",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  messageBubbleMine: {
    alignSelf: "flex-end",
    backgroundColor: "#5B61D6",
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 4,
  },
  messageText: { color: "#3D414C", fontSize: 15, lineHeight: 22 },
  messageTextMine: { color: "#FFF" },
  composer: {
    alignItems: "flex-end",
    backgroundColor: "#FFF",
    borderTopColor: "#E4E4E9",
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    padding: 10,
  },
  attachmentButton: {
    alignItems: "center",
    backgroundColor: "#ECECF1",
    borderRadius: 19,
    height: 38,
    justifyContent: "center",
    marginRight: 8,
    width: 38,
  },
  attachmentText: { color: "#5B61D6", fontSize: 24 },
  composerInput: {
    backgroundColor: "#F1F1F4",
    borderRadius: 18,
    color: "#252832",
    flex: 1,
    maxHeight: 100,
    minHeight: 38,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: "#5B61D6",
    borderRadius: 19,
    height: 38,
    justifyContent: "center",
    marginLeft: 8,
    width: 38,
  },
  sendButtonDisabled: { backgroundColor: "#C8CAD2" },
  sendText: { color: "#FFF", fontSize: 22, fontWeight: "700" },
  emptyState: {
    alignItems: "center",
    paddingHorizontal: 28,
    paddingVertical: 56,
  },
  emptyIcon: { color: "#C3C6D1", fontSize: 40, marginBottom: 12 },
  emptyTitle: {
    color: "#2A2E3A",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 6,
  },
  emptyBody: {
    color: "#858995",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  detailsContent: { paddingBottom: 32, paddingHorizontal: 16 },
  detailsHero: { alignItems: "center", paddingVertical: 20 },
  detailsTitle: {
    color: "#20232B",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 10,
  },
  detailsSubtitle: { color: "#858995", fontSize: 13, marginTop: 3 },
  card: { backgroundColor: "#FFF", borderRadius: 14, overflow: "hidden" },
  participantRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 14,
  },
  participantName: { color: "#252832", fontSize: 16 },
  rowBorder: {
    borderTopColor: "#EEEFF3",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  settingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 60,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  settingTitle: { color: "#252832", fontSize: 16 },
  settingHint: { color: "#8A8E99", fontSize: 12, marginTop: 2 },
  optionRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 52,
    paddingHorizontal: 14,
  },
  radio: {
    alignItems: "center",
    borderColor: "#C8CAD2",
    borderRadius: 10,
    borderWidth: 1.5,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  radioActive: { borderColor: "#5B61D6" },
  radioDot: {
    backgroundColor: "#5B61D6",
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  deleteButton: {
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 14,
    marginTop: 18,
    paddingVertical: 15,
  },
  activityRow: {
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 14,
    flexDirection: "row",
    gap: 12,
    marginBottom: 8,
    padding: 12,
  },
  activityCopy: { flex: 1 },
  activityTitle: { color: "#252832", fontSize: 15, fontWeight: "700" },
  activityBody: { color: "#737783", fontSize: 13, lineHeight: 18, marginTop: 2 },
  activityAuthor: { color: "#4A4F5C", fontWeight: "600" },
  activityEmpty: { backgroundColor: "#FFF", borderRadius: 14, padding: 18 },
  activityEmptyText: { color: "#858995", fontSize: 14 },
  profileContent: { paddingBottom: 32, paddingHorizontal: 16 },
  profileCard: {
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 14,
    flexDirection: "row",
    gap: 14,
    padding: 16,
  },
  profileName: { color: "#252832", fontSize: 18, fontWeight: "700" },
  profileSubtitle: { color: "#818591", fontSize: 13, marginTop: 3 },
  statsRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  statCard: {
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 14,
    flex: 1,
    paddingVertical: 16,
  },
  statValue: { color: "#20232B", fontSize: 22, fontWeight: "800" },
  statLabel: { color: "#858995", fontSize: 12, marginTop: 2 },
  signOutButton: {
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 14,
    marginTop: 20,
    paddingVertical: 15,
  },
  dangerText: { color: "#C44949", fontSize: 16 },
  version: { color: "#A0A3AC", fontSize: 12, marginTop: 20, textAlign: "center" },
  sheetBackdrop: {
    backgroundColor: "rgba(18,20,28,0.42)",
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#F7F7F9",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  sheetHandle: {
    alignSelf: "center",
    backgroundColor: "#D5D7DF",
    borderRadius: 2,
    height: 4,
    marginBottom: 12,
    width: 40,
  },
  sheetTitle: {
    color: "#20232B",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sheetBody: {
    color: "#4A4F5C",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sheetBodyMuted: {
    color: "#8A8E99",
    fontSize: 12,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sheetRow: {
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 12,
    flexDirection: "row",
    marginBottom: 8,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  sheetRowText: { color: "#252832", fontSize: 16 },
  sheetRowHint: { color: "#8A8E99", fontSize: 12, marginTop: 2 },
  sheetChevron: { color: "#A0A3AC", fontSize: 20 },
  signInScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 24,
  },
  signInTitle: {
    color: "#1D2130",
    fontSize: 26,
    fontWeight: "800",
    marginTop: 18,
  },
  signInBody: {
    color: "#6D7281",
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 24,
    marginTop: 8,
  },
  inputLabel: {
    color: "#858995",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  fieldSpacing: { marginBottom: 14 },
  signInInput: {
    backgroundColor: "#FFF",
    borderColor: "#E3E4EA",
    borderRadius: 11,
    borderWidth: 1,
    color: "#252832",
    fontSize: 16,
    height: 46,
    paddingHorizontal: 14,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#5B61D6",
    borderRadius: 12,
    marginTop: 14,
    paddingVertical: 14,
  },
  primaryButtonDisabled: { backgroundColor: "#C8CAD2" },
  primaryButtonText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  authError: {
    color: "#B23B3B",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  authToggle: { alignItems: "center", marginTop: 18 },
  authToggleText: { color: "#5B61D6", fontSize: 14, fontWeight: "600" },
  demoCard: {
    backgroundColor: "#EEF0FF",
    borderRadius: 12,
    marginTop: 22,
    padding: 12,
  },
  demoTitle: {
    color: "#4A4F76",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  demoText: { color: "#4A4F76", fontSize: 13, lineHeight: 19, marginTop: 4 },
  authServer: {
    color: "#A0A3AC",
    fontSize: 11,
    marginTop: 16,
    textAlign: "center",
  },
});
