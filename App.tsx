import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
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
  Conversation,
  initialConversations,
  Message,
  people,
  Person,
} from "./src/data/mockData";
import {
  loadConversations,
  loadSession,
  saveConversations,
  saveSession,
  Session,
} from "./src/storage/sessionStore";

type Tab = "chat" | "activity" | "profile";
type Filter = "all" | "unread" | "teams";
type SheetName = "menu" | "attach" | "delete" | "about" | null;
type NotificationPref = "all" | "mentions" | "muted";

const me = people[0];

function Avatar({ person, size = 42 }: { person: Person; size?: number }) {
  return (
    <View
      style={[
        styles.avatar,
        { backgroundColor: person.color, height: size, width: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.34 }]}>{person.initials}</Text>
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
        <Text style={[styles.sheetRowText, destructive && styles.dangerText]}>{label}</Text>
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

function ConversationList({
  conversations,
  query,
  filter,
  onQueryChange,
  onFilterChange,
  onSelect,
  onProfile,
  onMarkAllRead,
  onCreate,
}: {
  conversations: Conversation[];
  query: string;
  filter: Filter;
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
        ...conversation.participants.map((person) => person.name),
        ...conversation.messages.map((message) => message.body),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [conversations, filter, query]);

  const unread = conversations.reduce((total, conversation) => total + conversation.unreadCount, 0);

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
              <Text style={active ? styles.filterTextActive : styles.filterText}>{label}</Text>
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
            <Text style={styles.sectionLabel}>{query.trim() ? "RESULTS" : "RECENT"}</Text>
            {unread > 0 ? (
              <Pressable accessibilityRole="button" onPress={onMarkAllRead} hitSlop={8}>
                <Text style={styles.sectionAction}>Mark all read</Text>
              </Pressable>
            ) : (
              <Text style={styles.sectionMuted}>All read</Text>
            )}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title={query.trim() ? "No matches" : filter === "unread" ? "You're all caught up" : "No conversations yet"}
            body={
              query.trim()
                ? `Nothing matches “${query.trim()}”. Try a person, team, or message.`
                : filter === "unread"
                  ? "Unread conversations will appear here."
                  : "Tap + to start a conversation."
            }
          />
        }
        renderItem={({ item }) => {
          const lastMessage = item.messages[item.messages.length - 1];
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.title}`}
              style={({ pressed }) => [styles.conversationRow, pressed && styles.pressed]}
              onPress={() => onSelect(item)}
            >
              <View style={styles.avatarStack}>
                <Avatar person={item.participants[0]} />
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
                    style={[styles.conversationTitle, item.unreadCount > 0 && styles.unreadText]}
                  >
                    {item.title}
                  </Text>
                  <Text style={styles.timestamp}>{lastMessage ? lastMessage.createdAt : ""}</Text>
                </View>
                <View style={styles.rowBottomLine}>
                  <Text numberOfLines={1} style={[styles.preview, item.unreadCount > 0 && styles.unreadText]}>
                    {lastMessage ? lastMessage.body : "No messages yet"}
                  </Text>
                  {item.unreadCount > 0 ? <Text style={styles.badge}>{item.unreadCount}</Text> : null}
                </View>
              </View>
            </Pressable>
          );
        }}
      />
      <Pressable accessibilityRole="button" accessibilityLabel="New conversation" style={styles.composeButton} onPress={onCreate}>
        <Text style={styles.composeButtonText}>＋</Text>
      </Pressable>
    </View>
  );
}

function NewConversationView({
  onBack,
  onPick,
}: {
  onBack: () => void;
  onPick: (person: Person) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.flex, { paddingBottom: insets.bottom }]}>
      <Header title="New message" onBack={onBack} />
      <FlatList
        data={people.filter((person) => person.id !== me.id)}
        keyExtractor={(person) => person.id}
        contentContainerStyle={styles.newMessageContent}
        ListHeaderComponent={
          <View>
            <Text style={styles.sectionLabel}>TO</Text>
            <Text style={styles.newMessageHint}>Choose a person or team to message.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Message ${item.name}`}
            onPress={() => onPick(item)}
            style={({ pressed }) => [styles.personRow, pressed && styles.pressed]}
          >
            <Avatar person={item} size={42} />
            <View style={styles.flex}>
              <Text style={styles.personName}>{item.name}</Text>
              <Text style={styles.personHint}>{item.id === "worship" ? "Team" : "Person"}</Text>
            </View>
            <Text style={styles.sheetChevron}>›</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

function ConversationView({
  conversation,
  onBack,
  onSend,
  onDetails,
  onOpenMenu,
  onAttach,
}: {
  conversation: Conversation;
  onBack: () => void;
  onSend: (body: string) => void;
  onDetails: () => void;
  onOpenMenu: () => void;
  onAttach: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState("");
  const listRef = useRef<FlatList<Message>>(null);

  const canSend = draft.trim().length > 0;

  function submit() {
    if (!canSend) return;
    onSend(draft.trim());
    setDraft("");
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.flex, { paddingBottom: insets.bottom }]}
      keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
    >
      <Header
        title={conversation.title}
        onBack={onBack}
        action={{ label: "⋯", onPress: onOpenMenu, accessibilityLabel: "Conversation options" }}
      />
      <Pressable accessibilityRole="button" onPress={onDetails} style={styles.conversationSubheader}>
        <Text style={styles.subheaderText}>{conversation.participants.length + 1} participants</Text>
        <Text style={styles.subheaderAction}>Details ›</Text>
      </Pressable>
      <FlatList
        ref={listRef}
        style={styles.flex}
        data={conversation.messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.messageList, conversation.messages.length === 0 && styles.flex]}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <EmptyState
            title="No messages yet"
            body={`This is the beginning of your conversation with ${conversation.participants
              .map((person) => person.name)
              .join(", ")}.`}
          />
        }
        renderItem={({ item }) => {
          const mine = item.author.id === me.id;
          return (
            <View style={[styles.messageRow, mine && styles.messageRowMine]}>
              <Avatar person={item.author} size={34} />
              <View style={[styles.messageBody, mine && styles.messageBodyMine]}>
                <View style={[styles.messageMeta, mine && styles.messageMetaMine]}>
                  <Text style={styles.messageAuthor}>{mine ? "You" : item.author.name}</Text>
                  <Text style={styles.timestamp}>{item.createdAt}</Text>
                </View>
                <View style={[styles.messageBubble, mine && styles.messageBubbleMine]}>
                  <Text style={[styles.messageText, mine && styles.messageTextMine]}>{item.body}</Text>
                </View>
              </View>
            </View>
          );
        }}
      />
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
          <Text style={styles.sendText}>↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function DetailsView({
  conversation,
  muted,
  onBack,
  onToggleMute,
  onDelete,
}: {
  conversation: Conversation;
  muted: boolean;
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
          <Avatar person={conversation.participants[0]} size={64} />
          <Text style={styles.detailsTitle}>{conversation.title}</Text>
          <Text style={styles.detailsSubtitle}>
            {conversation.kind === "direct" ? "Direct message" : conversation.kind === "team" ? "Team conversation" : "Group conversation"}
          </Text>
        </View>

        <Text style={styles.sectionLabel}>PARTICIPANTS</Text>
        <View style={styles.card}>
          {conversation.participants.map((person, index) => (
            <View key={person.id} style={[styles.participantRow, index > 0 && styles.rowBorder]}>
              <Avatar person={person} size={38} />
              <Text style={styles.participantName}>{person.name}</Text>
            </View>
          ))}
          <View style={[styles.participantRow, styles.rowBorder]}>
            <Avatar person={me} size={38} />
            <Text style={styles.participantName}>{me.name} (you)</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>PREFERENCES</Text>
        <View style={styles.card}>
          <View style={styles.settingRow}>
            <View style={styles.flex}>
              <Text style={styles.settingTitle}>Mute notifications</Text>
              <Text style={styles.settingHint}>Pause alerts for this conversation only</Text>
            </View>
            <Switch
              value={muted}
              onValueChange={onToggleMute}
              trackColor={{ false: "#D6D8E0", true: "#B9BCF0" }}
              thumbColor={muted ? "#5B61D6" : "#F7F7F9"}
            />
          </View>
        </View>

        <Pressable accessibilityRole="button" onPress={onDelete} style={styles.deleteButton}>
          <Text style={styles.dangerText}>Delete conversation</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function ActivityView({
  conversations,
  onSelect,
}: {
  conversations: Conversation[];
  onSelect: (conversation: Conversation) => void;
}) {
  const unreadItems = useMemo(
    () =>
      conversations
        .flatMap((conversation) =>
          conversation.messages
            .filter((message) => message.unread)
            .map((message) => ({ conversation, message })),
        )
        .slice(0, 20),
    [conversations],
  );
  const recent = useMemo(
    () =>
      conversations
        .map((conversation) => ({ conversation, message: conversation.messages[conversation.messages.length - 1] }))
        .filter((entry): entry is { conversation: Conversation; message: Message } => Boolean(entry.message)),
    [conversations],
  );

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
          unreadItems.map(({ conversation, message }) => (
            <Pressable
              key={message.id}
              accessibilityRole="button"
              onPress={() => onSelect(conversation)}
              style={({ pressed }) => [styles.activityRow, pressed && styles.pressed]}
            >
              <Avatar person={message.author} size={38} />
              <View style={styles.activityCopy}>
                <Text style={styles.activityTitle}>{conversation.title}</Text>
                <Text numberOfLines={2} style={styles.activityBody}>
                  <Text style={styles.activityAuthor}>{message.author.name}: </Text>
                  {message.body}
                </Text>
              </View>
              <Text style={styles.timestamp}>{message.createdAt}</Text>
            </Pressable>
          ))
        )}

        <Text style={styles.sectionLabel}>RECENT</Text>
        {recent.map(({ conversation, message }) => (
          <Pressable
            key={`recent-${conversation.id}`}
            accessibilityRole="button"
            onPress={() => onSelect(conversation)}
            style={({ pressed }) => [styles.activityRow, pressed && styles.pressed]}
          >
            <Avatar person={conversation.participants[0]} size={38} />
            <View style={styles.activityCopy}>
              <Text style={styles.activityTitle}>{conversation.title}</Text>
              <Text numberOfLines={1} style={styles.activityBody}>
                {message.body}
              </Text>
            </View>
            <Text style={styles.timestamp}>{message.createdAt}</Text>
          </Pressable>
        ))}
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
  const unread = conversations.reduce((total, conversation) => total + conversation.unreadCount, 0);

  return (
    <View style={styles.flex}>
      <View style={styles.simpleHeader}>
        <Text style={styles.eyebrow}>PLANNING CENTER</Text>
        <Text style={styles.homeTitle}>Profile</Text>
      </View>
      <ScrollView contentContainerStyle={styles.profileContent}>
        <View style={styles.profileCard}>
          <Avatar person={me} size={56} />
          <View style={styles.flex}>
            <Text style={styles.profileName}>{session.displayName}</Text>
            <Text style={styles.profileSubtitle}>Planning Center account</Text>
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
          <Pressable accessibilityRole="button" onPress={onAbout} style={styles.optionRow}>
            <Text style={styles.settingTitle}>About this rebuild</Text>
            <Text style={styles.sheetChevron}>›</Text>
          </Pressable>
        </View>

        <Pressable accessibilityRole="button" onPress={onSignOut} style={styles.signOutButton}>
          <Text style={styles.dangerText}>Sign out</Text>
        </Pressable>

        <Text style={styles.version}>Open Services rebuild · local MVP</Text>
      </ScrollView>
    </View>
  );
}

function SignInView({ onSignIn }: { onSignIn: (name: string) => void }) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("Marcos");

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.flex, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
    >
      <View style={styles.signInContent}>
        <Avatar person={me} size={72} />
        <Text style={styles.signInTitle}>Welcome back</Text>
        <Text style={styles.signInBody}>
          This is a local rebuild of the Planning Center Services chat experience. Sign in to continue where you left off.
        </Text>
        <Text style={styles.inputLabel}>DISPLAY NAME</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor="#8D919C"
          style={styles.signInInput}
          autoCapitalize="words"
          accessibilityLabel="Display name"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: name.trim().length === 0 }}
          disabled={name.trim().length === 0}
          onPress={() => onSignIn(name.trim())}
          style={[styles.primaryButton, name.trim().length === 0 && styles.primaryButtonDisabled]}
        >
          <Text style={styles.primaryButtonText}>Continue</Text>
        </Pressable>
        <Text style={styles.signInFootnote}>No server connection · data stays on this device</Text>
      </View>
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
              <Text style={[styles.tabIcon, active && styles.tabIconActive]}>{icon}</Text>
              {value === "chat" && unread > 0 ? <Text style={styles.tabBadge}>{unread}</Text> : null}
            </View>
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function nowLabel() {
  const date = new Date();
  const hours = date.getHours();
  return `${((hours + 11) % 12) + 1}:${String(date.getMinutes()).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

function AppShell() {
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<Session>({ displayName: me.name, signedIn: true });
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [hydrated, setHydrated] = useState(false);

  const [tab, setTab] = useState<Tab>("chat");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<SheetName>(null);
  const [mutedIds, setMutedIds] = useState<Record<string, boolean>>({});
  const [notificationPref, setNotificationPref] = useState<NotificationPref>("all");

  useEffect(() => {
    let mounted = true;
    Promise.all([loadSession(), loadConversations()])
      .then(([storedSession, storedConversations]) => {
        if (!mounted) return;
        setSession(storedSession);
        if (storedConversations) {
          setConversations(storedConversations);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setHydrated(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveConversations(conversations).catch(() => undefined);
  }, [conversations, hydrated]);

  useEffect(() => {
    if (Platform.OS !== "android") return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
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
    });
    return () => subscription.remove();
  }, [composing, detailsId, selectedId, sheet, tab]);

  const selectedConversation = conversations.find((conversation) => conversation.id === selectedId) ?? null;
  const detailsConversation = conversations.find((conversation) => conversation.id === detailsId) ?? null;
  const unread = conversations.reduce((total, conversation) => total + conversation.unreadCount, 0);

  function openConversation(conversation: Conversation) {
    setComposing(false);
    setSelectedId(conversation.id);
    setTab("chat");
    setConversations((current) =>
      current.map((item) =>
        item.id === conversation.id
          ? {
              ...item,
              unreadCount: 0,
              messages: item.messages.map((message) => ({ ...message, unread: false })),
            }
          : item,
      ),
    );
  }

  function sendMessage(body: string) {
    if (!selectedId) return;
    const message: Message = {
      id: `local-${Date.now()}`,
      author: me,
      body,
      createdAt: nowLabel(),
    };
    setConversations((current) =>
      current.map((item) =>
        item.id === selectedId
          ? { ...item, unreadCount: 0, messages: [...item.messages, message] }
          : item,
      ),
    );
  }

  function startConversation(person: Person) {
    const existing = conversations.find(
      (conversation) =>
        conversation.kind === "direct" &&
        conversation.participants.length === 1 &&
        conversation.participants[0].id === person.id,
    );
    setComposing(false);
    if (existing) {
      openConversation(existing);
      return;
    }
    const conversation: Conversation = {
      id: `new-${Date.now()}`,
      title: person.name,
      kind: person.id === "worship" ? "team" : "direct",
      participants: [person],
      unreadCount: 0,
      messages: [],
    };
    setConversations((current) => [conversation, ...current]);
    setQuery("");
    setFilter("all");
    setSelectedId(conversation.id);
    setTab("chat");
  }

  function markAllRead() {
    setConversations((current) =>
      current.map((conversation) => ({
        ...conversation,
        unreadCount: 0,
        messages: conversation.messages.map((message) => ({ ...message, unread: false })),
      })),
    );
  }

  function markUnread() {
    if (!selectedId) return;
    setConversations((current) =>
      current.map((conversation) => {
        if (conversation.id !== selectedId) return conversation;
        const messages = [...conversation.messages];
        const last = messages[messages.length - 1];
        if (last) messages[messages.length - 1] = { ...last, unread: true };
        return { ...conversation, messages, unreadCount: Math.max(conversation.unreadCount, 1) };
      }),
    );
    setSelectedId(null);
    setSheet(null);
  }

  function deleteConversation(id: string) {
    setConversations((current) => current.filter((conversation) => conversation.id !== id));
    setSelectedId(null);
    setDetailsId(null);
    setSheet(null);
  }

  function addAttachmentMessage(label: string) {
    sendMessage(`${label} — attachment previews are not connected in this local build.`);
    setSheet(null);
  }

  async function signOut() {
    const nextSession: Session = { ...session, signedIn: false };
    setSession(nextSession);
    setSelectedId(null);
    setDetailsId(null);
    setComposing(false);
    setTab("chat");
    await saveSession(nextSession);
  }

  async function signIn(name: string) {
    const nextSession: Session = { displayName: name || me.name, signedIn: true };
    setSession(nextSession);
    await saveSession(nextSession);
  }

  const contentStyle = { paddingTop: insets.top };

  if (!session.signedIn) {
    return (
      <View style={styles.app}>
        <StatusBar style="dark" />
        <SignInView onSignIn={signIn} />
      </View>
    );
  }

  const conversationMuted = selectedId ? Boolean(mutedIds[selectedId]) : false;

  return (
    <View style={styles.app}>
      <StatusBar style="dark" />
      <View style={[styles.flex, contentStyle]}>
        {selectedConversation ? (
          <ConversationView
            conversation={selectedConversation}
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
            muted={Boolean(mutedIds[detailsConversation.id])}
            onBack={() => {
              setSelectedId(detailsConversation.id);
              setDetailsId(null);
            }}
            onToggleMute={(value) =>
              setMutedIds((current) => ({ ...current, [detailsConversation.id]: value }))
            }
            onDelete={() => setSheet("delete")}
          />
        ) : composing ? (
          <NewConversationView onBack={() => setComposing(false)} onPick={startConversation} />
        ) : tab === "activity" ? (
          <ActivityView conversations={conversations} onSelect={openConversation} />
        ) : tab === "profile" ? (
          <ProfileView
            session={session}
            conversations={conversations}
            notificationPref={notificationPref}
            onNotificationPrefChange={setNotificationPref}
            onAbout={() => setSheet("about")}
            onSignOut={signOut}
          />
        ) : (
          <ConversationList
            conversations={conversations}
            query={query}
            filter={filter}
            onQueryChange={setQuery}
            onFilterChange={setFilter}
            onSelect={openConversation}
            onProfile={() => setTab("profile")}
            onMarkAllRead={markAllRead}
            onCreate={() => setComposing(true)}
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
          <Sheet visible={sheet === "menu"} title={selectedConversation.title} onClose={() => setSheet(null)}>
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
              label={conversationMuted ? "Unmute notifications" : "Mute notifications"}
              hint={conversationMuted ? "Alerts are currently paused" : "Pause alerts for this conversation"}
              onPress={() => {
                setMutedIds((current) => ({
                  ...current,
                  [selectedConversation.id]: !current[selectedConversation.id],
                }));
                setSheet(null);
              }}
            />
            <SheetRow label="Mark as unread" onPress={markUnread} />
            <SheetRow label="Delete conversation" destructive onPress={() => setSheet("delete")} />
            <SheetRow label="Cancel" onPress={() => setSheet(null)} />
          </Sheet>

          <Sheet visible={sheet === "attach"} title="Add attachment" onClose={() => setSheet(null)}>
            <SheetRow label="Photo" hint="Local demo placeholder" onPress={() => addAttachmentMessage("Photo")} />
            <SheetRow label="File" hint="Local demo placeholder" onPress={() => addAttachmentMessage("File")} />
            <SheetRow label="Cancel" onPress={() => setSheet(null)} />
          </Sheet>
        </>
      ) : null}

      <Sheet visible={sheet === "delete"} title="Delete this conversation?" onClose={() => setSheet(null)}>
        <Text style={styles.sheetBody}>
          This removes the conversation and its {selectedConversation?.messages.length ?? detailsConversation?.messages.length ?? 0} messages
          from this device. This cannot be undone.
        </Text>
        <SheetRow
          label="Delete conversation"
          destructive
          onPress={() => {
            const id = selectedConversation?.id ?? detailsConversation?.id;
            if (id) deleteConversation(id);
          }}
        />
        <SheetRow label="Cancel" onPress={() => setSheet(null)} />
      </Sheet>

      <Sheet visible={sheet === "about"} title="About this rebuild" onClose={() => setSheet(null)}>
        <Text style={styles.sheetBody}>
          Open Services is a local, offline rebuild of the Planning Center Services chat surface. Data lives in
          AsyncStorage on this device; there is no server connection, OAuth, or telemetry.
        </Text>
        <Text style={styles.sheetBodyMuted}>Version 0.1.0 · Expo 57 · React Native 0.86</Text>
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
  header: {
    alignItems: "center",
    backgroundColor: "#F7F7F9",
    flexDirection: "row",
    height: 58,
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  headerButton: { alignItems: "center", height: 40, justifyContent: "center", minWidth: 42 },
  headerButtonText: { color: "#272B36", fontSize: 38, fontWeight: "300", lineHeight: 40 },
  headerAction: { color: "#5B61D6", fontSize: 22 },
  headerTitle: { color: "#20232B", flex: 1, fontSize: 19, fontWeight: "700", textAlign: "center" },
  homeHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 18,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  simpleHeader: { paddingBottom: 14, paddingHorizontal: 20, paddingTop: 12 },
  eyebrow: { color: "#747B91", fontSize: 10, fontWeight: "800", letterSpacing: 1.5, marginBottom: 4 },
  homeTitle: { color: "#1D2130", fontSize: 29, fontWeight: "800", letterSpacing: -0.8 },
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
  clearButton: { alignItems: "center", height: 28, justifyContent: "center", width: 28 },
  clearButtonText: { color: "#8A8E99", fontSize: 22, lineHeight: 24 },
  filterBar: { flexDirection: "row", gap: 8, paddingHorizontal: 20, paddingVertical: 18 },
  filterPill: {
    borderColor: "#E0E1E8",
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 17,
    paddingVertical: 8,
  },
  filterPillActive: { backgroundColor: "#252A42", borderRadius: 18, paddingHorizontal: 18, paddingVertical: 9 },
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
  sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
  sectionLabel: {
    color: "#858995",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginBottom: 8,
    marginTop: 14,
  },
  sectionAction: { color: "#5B61D6", fontSize: 12, fontWeight: "600", marginTop: 2 },
  sectionMuted: { color: "#A0A3AC", fontSize: 12, fontWeight: "600", marginTop: 2 },
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
  rowTopLine: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  rowBottomLine: { alignItems: "center", flexDirection: "row", marginTop: 4 },
  conversationTitle: { color: "#252832", flex: 1, fontSize: 16, fontWeight: "600", marginRight: 8 },
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
  composeButtonText: { color: "#FFF", fontSize: 30, fontWeight: "300", marginTop: -3 },
  bottomTabs: {
    alignItems: "center",
    backgroundColor: "#FFF",
    borderTopColor: "#E6E6EB",
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 8,
  },
  tab: { alignItems: "center", gap: 2, justifyContent: "center", minHeight: 46, width: 80 },
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
  emptyState: { alignItems: "center", paddingHorizontal: 28, paddingVertical: 56 },
  emptyIcon: { color: "#C3C6D1", fontSize: 40, marginBottom: 12 },
  emptyTitle: { color: "#2A2E3A", fontSize: 17, fontWeight: "700", marginBottom: 6 },
  emptyBody: { color: "#858995", fontSize: 14, lineHeight: 20, textAlign: "center" },
  detailsContent: { paddingBottom: 32, paddingHorizontal: 16 },
  detailsHero: { alignItems: "center", paddingVertical: 20 },
  detailsTitle: { color: "#20232B", fontSize: 20, fontWeight: "800", marginTop: 10 },
  detailsSubtitle: { color: "#858995", fontSize: 13, marginTop: 3 },
  card: { backgroundColor: "#FFF", borderRadius: 14, overflow: "hidden" },
  participantRow: { alignItems: "center", flexDirection: "row", gap: 12, minHeight: 58, paddingHorizontal: 14 },
  participantName: { color: "#252832", fontSize: 16 },
  rowBorder: { borderTopColor: "#EEEFF3", borderTopWidth: StyleSheet.hairlineWidth },
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
  radioDot: { backgroundColor: "#5B61D6", borderRadius: 5, height: 10, width: 10 },
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
  statCard: { alignItems: "center", backgroundColor: "#FFF", borderRadius: 14, flex: 1, paddingVertical: 16 },
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
  sheetBackdrop: { backgroundColor: "rgba(18,20,28,0.42)", flex: 1, justifyContent: "flex-end" },
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
  sheetTitle: { color: "#20232B", fontSize: 18, fontWeight: "800", marginBottom: 10, paddingHorizontal: 4 },
  sheetBody: { color: "#4A4F5C", fontSize: 14, lineHeight: 20, marginBottom: 10, paddingHorizontal: 4 },
  sheetBodyMuted: { color: "#8A8E99", fontSize: 12, marginBottom: 12, paddingHorizontal: 4 },
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
  signInContent: { flex: 1, justifyContent: "center", paddingHorizontal: 28 },
  signInTitle: { color: "#1D2130", fontSize: 26, fontWeight: "800", marginTop: 18 },
  signInBody: { color: "#6D7281", fontSize: 14, lineHeight: 21, marginBottom: 24, marginTop: 8 },
  inputLabel: { color: "#858995", fontSize: 10, fontWeight: "800", letterSpacing: 1.4, marginBottom: 8 },
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
  signInFootnote: { color: "#A0A3AC", fontSize: 12, marginTop: 18, textAlign: "center" },
});
