import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  describeError,
  parsePocketBaseDate,
  POCKETBASE_URL,
  restoreSession,
  signIn,
  signOut,
  signUp,
  toPersonFromSession,
} from "./api/pocketbase";
import { Avatar } from "./components/Avatar";
import { BottomTabs } from "./components/BottomTabs";
import { ErrorBanner } from "./components/Feedback";
import { Sheet, SheetRow } from "./components/Sheet";
import { REACTION_EMOJIS } from "./constants";
import { useMessageSearch } from "./hooks/useMessageSearch";
import { usePreferences } from "./hooks/usePreferences";
import { useWorkspace } from "./hooks/useWorkspace";
import {
  firstNames,
  readCoversMessage,
  unreadTotal,
} from "./lib/messages";
import { ActivityScreen } from "./screens/ActivityScreen";
import { ConversationListScreen } from "./screens/ConversationListScreen";
import { ConversationScreen } from "./screens/ConversationScreen";
import { DetailsScreen } from "./screens/DetailsScreen";
import { NewConversationScreen } from "./screens/NewConversationScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { SignInScreen } from "./screens/SignInScreen";
import { styles } from "./styles";
import type {
  AuthMode,
  Conversation,
  ConversationFilter,
  Message,
  NotificationPref,
  Person,
  Session,
  SheetName,
  Tab,
} from "./types";

export function AppShell() {
  const insets = useSafeAreaInsets();
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const { preferences, setPreferences, hydrated } = usePreferences();
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const [tab, setTab] = useState<Tab>("chat");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<SheetName>(null);
  const [actionMessageId, setActionMessageId] = useState<string | null>(null);
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const userId = session?.user.id ?? "";
  const readAt = preferences.readAtByUser[userId] ?? {};
  const mutedIds = preferences.mutedByUser[userId] ?? {};
  const notificationPref =
    preferences.notificationPrefByUser[userId] ?? "all";

  const setReadAt = useCallback(
    (conversationId: string, iso: string | null) => {
      if (!userId) return;
      setPreferences((current) => {
        const reads = { ...(current.readAtByUser[userId] ?? {}) };
        if (iso) reads[conversationId] = iso;
        else delete reads[conversationId];
        return {
          ...current,
          readAtByUser: {
            ...current.readAtByUser,
            [userId]: reads,
          },
        };
      });
    },
    [setPreferences, userId],
  );

  function clearDeletedMessageActions(messageId: string) {
    setReplyTargetId((current) => (current === messageId ? null : current));
    setEditingId((current) => (current === messageId ? null : current));
    setActionMessageId((current) => (current === messageId ? null : current));
  }

  const workspace = useWorkspace({
    user: session?.user ?? null,
    selectedId,
    readAt,
    setReadAt,
    onMessageDeleted: clearDeletedMessageActions,
  });
  const { messageSearchIds, searchingMessages } = useMessageSearch(
    userId,
    query,
  );

  const bootStartedRef = useRef(false);

  useEffect(() => {
    if (!hydrated || bootStartedRef.current) return undefined;
    bootStartedRef.current = true;
    let active = true;

    (async () => {
      const user = await restoreSession();
      if (!active) return;
      if (!user) {
        setBooting(false);
        return;
      }

      setSession({ user: toPersonFromSession(user), email: user.email });
      await workspace.loadWorkspace(
        user.id,
        preferences.readAtByUser[user.id] ?? {},
      );
      if (active) setBooting(false);
    })();

    return () => {
      active = false;
    };
    // Boot runs once preferences have hydrated; workspace only uses setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  useEffect(() => {
    setActionMessageId(null);
    setReplyTargetId(null);
    setEditingId(null);
    setSheet(null);
  }, [selectedId]);

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
    if (
      selectedId &&
      !workspace.conversations.some((item) => item.id === selectedId)
    ) {
      setSelectedId(null);
    }
    if (
      detailsId &&
      !workspace.conversations.some((item) => item.id === detailsId)
    ) {
      setDetailsId(null);
    }
  }, [detailsId, selectedId, workspace.conversations]);

  function openConversation(conversation: Conversation) {
    if (!session) return;
    const conversationId = conversation.id;

    setComposing(false);
    setSelectedId(conversationId);
    setTab("chat");
    setReplyTargetId(null);
    setEditingId(null);
    setActionMessageId(null);
    setSheet(null);
    workspace.markRead(conversationId);
    void workspace.loadConversation(conversationId);
  }

  async function sendMessage(
    body: string,
    replyToId: string | null = null,
  ): Promise<boolean> {
    if (!selectedId) return false;
    const sent = await workspace.sendMessage(selectedId, body, replyToId);
    if (sent && replyToId) setReplyTargetId(null);
    return sent;
  }

  async function saveEditedMessage(
    messageId: string,
    body: string,
  ): Promise<boolean> {
    if (!selectedId) return false;
    const saved = await workspace.saveEditedMessage(selectedId, messageId, body);
    if (saved) setEditingId(null);
    return saved;
  }

  async function removeMessage(messageId: string) {
    const removed = await workspace.removeMessage(messageId);
    if (removed) {
      if (replyTargetId === messageId) setReplyTargetId(null);
      if (editingId === messageId) setEditingId(null);
      setActionMessageId(null);
    }
    setSheet(null);
  }

  async function copyMessage(message: Message) {
    await workspace.copyMessage(message);
    setSheet(null);
  }

  function openMessageActions(message: Message) {
    setActionMessageId(message.id);
    setSheet("message");
  }

  function startReply(message: Message) {
    setEditingId(null);
    setReplyTargetId(message.id);
    setSheet(null);
  }

  function startEdit(message: Message) {
    setReplyTargetId(null);
    setEditingId(message.id);
    setSheet(null);
  }

  async function startConversation(person: Person) {
    if (!session) return;

    const existing = workspace.conversations.find(
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

    const conversation = await workspace.createConversation(person);
    if (!conversation) return;
    setQuery("");
    setFilter("all");
    openConversation(conversation);
  }

  function markAllRead() {
    workspace.markAllRead();
  }

  function markUnread() {
    if (!selectedId) return;
    workspace.markUnread(selectedId);
    setSelectedId(null);
    setSheet(null);
  }

  async function deleteConversation(conversationId: string) {
    const removed = await workspace.deleteConversation(conversationId);
    if (removed) {
      setSelectedId(null);
      setDetailsId(null);
    }
    setSheet(null);
  }

  function openCompose() {
    setComposing(true);
    workspace.setMessageError(null);
    void workspace.refreshPeople();
  }

  function toggleMute(conversationId: string, value: boolean) {
    if (!userId) return;
    setPreferences((current) => ({
      ...current,
      mutedByUser: {
        ...current.mutedByUser,
        [userId]: {
          ...(current.mutedByUser[userId] ?? {}),
          [conversationId]: value,
        },
      },
    }));
  }

  function changeNotificationPref(value: NotificationPref) {
    if (!userId) return;
    setPreferences((current) => ({
      ...current,
      notificationPrefByUser: {
        ...current.notificationPrefByUser,
        [userId]: value,
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
      await workspace.loadWorkspace(
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
    workspace.stopTyping();
    await signOut();
    setSession(null);
    setSelectedId(null);
    setDetailsId(null);
    setComposing(false);
    setTab("chat");
    setQuery("");
    setSheet(null);
    setActionMessageId(null);
    setReplyTargetId(null);
    setEditingId(null);
    setAuthError(null);
  }

  function retryWorkspace() {
    if (userId) {
      void workspace.loadWorkspace(userId, readAt);
    }
  }

  function addAttachmentMessage(label: string) {
    setSheet(null);
    if (selectedId) {
      void workspace.sendMessage(
        selectedId,
        `${label} attachment — previews are not connected in this build yet.`,
      );
    }
  }

  const contentStyle = { paddingTop: insets.top };
  const selectedConversation =
    workspace.conversations.find(
      (conversation) => conversation.id === selectedId,
    ) ?? null;
  const detailsConversation =
    workspace.conversations.find(
      (conversation) => conversation.id === detailsId,
    ) ?? null;
  const unread = unreadTotal(workspace.conversations);
  const selectedReads = selectedId
    ? workspace.readsByConversation[selectedId] ?? []
    : [];
  const replyTarget =
    selectedConversation && replyTargetId
      ? selectedConversation.messages.find(
          (message) => message.id === replyTargetId,
        ) ?? null
      : null;
  const editingMessage =
    selectedConversation && editingId
      ? selectedConversation.messages.find(
          (message) => message.id === editingId,
        ) ?? null
      : null;
  const actionMessage =
    selectedConversation && actionMessageId
      ? selectedConversation.messages.find(
          (message) => message.id === actionMessageId,
        ) ?? null
      : null;
  const actionMessageReaders = actionMessage
    ? selectedReads
        .filter(
          (read) =>
            read.user.id !== userId &&
            readCoversMessage(read, actionMessage),
        )
        .map((read) => read.user)
    : [];
  const typingNames = selectedConversation
    ? Object.entries(
        workspace.typingByConversation[selectedConversation.id] ?? {},
      )
        .filter(([typingUserId, lastSeen]) => {
          if (typingUserId === userId) return false;
          const seenAt = parsePocketBaseDate(lastSeen)?.getTime() ?? 0;
          return workspace.typingClock - seenAt < 7000;
        })
        .map(
          ([typingUserId]) =>
            selectedConversation.participants.find(
              (person) => person.id === typingUserId,
            )?.name,
        )
        .filter((name): name is string => Boolean(name))
    : [];

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
        <SignInScreen
          busy={authBusy}
          error={authError}
          serverUrl={POCKETBASE_URL}
          onSubmit={handleAuth}
          onClearError={() => setAuthError(null)}
        />
      </View>
    );
  }

  const conversationMuted = selectedId ? Boolean(mutedIds[selectedId]) : false;
  const selectedCanDelete = selectedConversation?.createdBy === session.user.id;
  const detailsCanDelete = detailsConversation?.createdBy === session.user.id;

  return (
    <View style={styles.app}>
      <StatusBar style="dark" />
      <View style={[styles.flex, contentStyle]}>
        {workspace.dataError ? (
          <ErrorBanner message={workspace.dataError} onRetry={retryWorkspace} />
        ) : null}
        {selectedConversation ? (
          <ConversationScreen
            conversation={selectedConversation}
            me={session.user}
            loading={workspace.loadingMessages}
            error={workspace.messageError}
            sending={workspace.sending}
            typingNames={typingNames}
            replyTo={replyTarget}
            editingMessage={editingMessage}
            reads={selectedReads}
            onBack={() => setSelectedId(null)}
            onSend={sendMessage}
            onSaveEdit={saveEditedMessage}
            onCancelReply={() => setReplyTargetId(null)}
            onCancelEdit={() => setEditingId(null)}
            onDetails={() => {
              setDetailsId(selectedConversation.id);
              setSelectedId(null);
            }}
            onOpenMenu={() => setSheet("menu")}
            onAttach={() => setSheet("attach")}
            onLongPressMessage={openMessageActions}
            onToggleReaction={workspace.toggleReaction}
            onTyping={() => workspace.noteTyping(selectedConversation.id)}
            onStopTyping={workspace.stopTyping}
          />
        ) : detailsConversation ? (
          <DetailsScreen
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
          <NewConversationScreen
            me={session.user}
            people={workspace.people}
            loading={workspace.loadingPeople}
            busy={workspace.creatingConversation}
            onBack={() => setComposing(false)}
            onPick={(person) => void startConversation(person)}
          />
        ) : tab === "activity" ? (
          <ActivityScreen
            conversations={workspace.conversations}
            me={session.user}
            onSelect={(conversation) => void openConversation(conversation)}
          />
        ) : tab === "profile" ? (
          <ProfileScreen
            session={session}
            conversations={workspace.conversations}
            notificationPref={notificationPref}
            onNotificationPrefChange={changeNotificationPref}
            onAbout={() => setSheet("about")}
            onSignOut={() => void handleSignOut()}
          />
        ) : (
          <ConversationListScreen
            conversations={workspace.conversations}
            me={session.user}
            loading={workspace.loadingWorkspace}
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

          {actionMessage ? (
            <>
              <Sheet
                visible={sheet === "message"}
                title="Message"
                onClose={() => setSheet(null)}
              >
                <View style={styles.reactionPicker}>
                  {REACTION_EMOJIS.map((emoji) => {
                    const active = actionMessage.reactions.some(
                      (reaction) =>
                        reaction.user.id === session.user.id &&
                        reaction.emoji === emoji,
                    );
                    return (
                      <Pressable
                        key={emoji}
                        accessibilityRole="button"
                        accessibilityLabel={`React with ${emoji}`}
                        accessibilityState={{ selected: active }}
                        onPress={() =>
                          workspace.toggleReaction(actionMessage, emoji)
                        }
                        style={[
                          styles.reactionPickerButton,
                          active && styles.reactionPickerButtonActive,
                        ]}
                      >
                        <Text style={styles.reactionPickerEmoji}>{emoji}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <SheetRow
                  label="Reply"
                  onPress={() => startReply(actionMessage)}
                />
                <SheetRow
                  label="Copy text"
                  onPress={() => void copyMessage(actionMessage)}
                />
                {actionMessage.author.id === session.user.id ? (
                  <SheetRow
                    label="Edit message"
                    onPress={() => startEdit(actionMessage)}
                  />
                ) : null}
                <SheetRow
                  label={`Read by${
                    actionMessageReaders.length > 0
                      ? ` (${actionMessageReaders.length})`
                      : ""
                  }`}
                  hint={
                    actionMessageReaders.length > 0
                      ? firstNames(actionMessageReaders)
                      : "No one has read this message yet"
                  }
                  chevron
                  onPress={() => setSheet("readBy")}
                />
                {actionMessage.author.id === session.user.id ? (
                  <SheetRow
                    label="Delete message"
                    destructive
                    onPress={() => setSheet("messageDelete")}
                  />
                ) : null}
                <SheetRow label="Cancel" onPress={() => setSheet(null)} />
              </Sheet>

              <Sheet
                visible={sheet === "readBy"}
                title="Read by"
                onClose={() => setSheet(null)}
              >
                {actionMessageReaders.length === 0 ? (
                  <Text style={styles.sheetBody}>
                    No one has read this message yet.
                  </Text>
                ) : (
                  actionMessageReaders.map((person) => (
                    <View key={person.id} style={styles.readerRow}>
                      <Avatar person={person} size={34} />
                      <Text style={styles.readerName}>{person.name}</Text>
                    </View>
                  ))
                )}
                <SheetRow label="Close" onPress={() => setSheet(null)} />
              </Sheet>

              <Sheet
                visible={sheet === "messageDelete"}
                title="Delete this message?"
                onClose={() => setSheet(null)}
              >
                <Text style={styles.sheetBody}>
                  This removes the message for everyone in the conversation. This
                  cannot be undone.
                </Text>
                <SheetRow
                  label="Delete message"
                  destructive
                  onPress={() => void removeMessage(actionMessage.id)}
                />
                <SheetRow label="Cancel" onPress={() => setSheet(null)} />
              </Sheet>
            </>
          ) : null}
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
