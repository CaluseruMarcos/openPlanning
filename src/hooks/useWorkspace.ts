import * as Clipboard from "expo-clipboard";
import { useEffect, useRef, useState } from "react";

import {
  addReaction,
  clearTypingIndicator,
  createDirectConversation,
  createMessage,
  deleteMessage,
  describeError,
  editMessage,
  fetchConversationReads,
  fetchConversations,
  fetchMessages,
  fetchPeople,
  fetchTypingIndicators,
  heartbeatTyping,
  markConversationRead,
  removeConversation,
  removeReaction,
  subscribeToConversationReads,
  subscribeToConversations,
  subscribeToMessages,
  subscribeToReactions,
  subscribeToRealtimeStatus,
  subscribeToTypingIndicators,
} from "../api/pocketbase";
import {
  addReactionToMessages,
  applyUnread,
  mergeMessage,
  removeReactionFromMessages,
} from "../lib/messages";
import type {
  Conversation,
  ConversationRead,
  Message,
  Person,
  Reaction,
} from "../types";

type UseWorkspaceOptions = {
  user: Person | null;
  selectedId: string | null;
  readAt: Record<string, string>;
  setReadAt: (conversationId: string, iso: string | null) => void;
  onMessageDeleted?: (messageId: string) => void;
};

export function useWorkspace({
  user,
  selectedId,
  readAt,
  setReadAt,
  onMessageDeleted,
}: UseWorkspaceOptions) {
  const userId = user?.id ?? "";

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [readsByConversation, setReadsByConversation] = useState<
    Record<string, ConversationRead[]>
  >({});
  const [typingByConversation, setTypingByConversation] = useState<
    Record<string, Record<string, string>>
  >({});
  const [typingClock, setTypingClock] = useState(() => Date.now());

  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const conversationsRef = useRef<Conversation[]>([]);
  conversationsRef.current = conversations;
  const readAtRef = useRef<Record<string, string>>({});
  readAtRef.current = readAt;
  const markReadRef = useRef<(conversationId: string) => void>(
    () => undefined,
  );
  const onMessageDeletedRef = useRef(onMessageDeleted);
  onMessageDeletedRef.current = onMessageDeleted;
  const messageRequestRef = useRef(0);
  const typingClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastTypingSentRef = useRef(0);
  const typingConversationRef = useRef<string | null>(null);

  // Clear the previous account's workspace when the session ends.
  useEffect(() => {
    if (userId) return;
    setConversations([]);
    setPeople([]);
    setLoadingWorkspace(false);
    setLoadingPeople(false);
    setLoadingMessages(false);
    setCreatingConversation(false);
    setDataError(null);
    setMessageError(null);
    setSending(false);
    setReadsByConversation({});
    setTypingByConversation({});
  }, [userId]);

  // Re-render the typing line as heartbeats get stale.
  useEffect(() => {
    if (!userId) return undefined;
    const timer = setInterval(() => setTypingClock(Date.now()), 2000);
    return () => clearInterval(timer);
  }, [userId]);

  // Clear our own indicator when leaving a conversation (or the app).
  useEffect(() => {
    return () => {
      stopTyping();
    };
    // stopTyping reads refs; only the conversation change matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    if (!userId) return undefined;
    const currentUserId = userId;
    let disposed = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribeMessages: (() => Promise<void>) | null = null;
    let unsubscribeConversations: (() => Promise<void>) | null = null;
    let unsubscribeReactions: (() => Promise<void>) | null = null;
    let unsubscribeReads: (() => Promise<void>) | null = null;
    let unsubscribeTyping: (() => Promise<void>) | null = null;
    let unsubscribeStatus: (() => Promise<void>) | null = null;
    let hasConnected = false;

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
          onMessageDeletedRef.current?.(deletedId);
        }
        refreshConversations();
        return;
      }

      const message = event.message;
      if (!message) return;
      const conversationId = message.conversationId;
      const isUpdate = event.action === "update";

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
            ...(isUpdate
              ? {}
              : {
                  lastMessagePreview: message.body,
                  lastMessageAt: message.createdAtIso,
                  lastMessageAuthorId: message.author.id,
                  unreadCount: isSelected || isMine ? 0 : 1,
                }),
          };
        }),
      );

      if (!isUpdate) {
        setTypingByConversation((current) => {
          const entries = { ...(current[conversationId] ?? {}) };
          delete entries[message.author.id];
          return { ...current, [conversationId]: entries };
        });
      }

      if (isSelected) {
        markReadRef.current(conversationId);
        void persistRead(conversationId, message);
      }
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

    void subscribeToReactions((event) => {
      if (disposed) return;
      if (event.action === "delete") {
        const reactionId = event.record?.id;
        if (reactionId) {
          setConversations((current) =>
            current.map((conversation) => ({
              ...conversation,
              messages: removeReactionFromMessages(
                conversation.messages,
                reactionId,
              ),
            })),
          );
        }
        return;
      }

      if (event.reaction) {
        setConversations((current) =>
          current.map((conversation) => ({
            ...conversation,
            messages: addReactionToMessages(
              conversation.messages,
              event.reaction!,
            ),
          })),
        );
      }
    })
      .then((unsubscribe) => {
        if (disposed) void unsubscribe();
        else unsubscribeReactions = unsubscribe;
      })
      .catch(() => undefined);

    void subscribeToConversationReads((event) => {
      if (disposed) return;
      const conversationId = event.record?.conversation;
      if (!conversationId) return;

      if (event.action === "delete") {
        const readerId = event.record?.user;
        if (readerId) {
          setReadsByConversation((current) => ({
            ...current,
            [conversationId]: (current[conversationId] ?? []).filter(
              (read) => read.user.id !== readerId,
            ),
          }));
        }
        return;
      }

      const read = event.read;
      if (!read) return;
      setReadsByConversation((current) => {
        const list = current[conversationId] ?? [];
        const index = list.findIndex((item) => item.user.id === read.user.id);
        const next =
          index >= 0
            ? list.map((item, itemIndex) => (itemIndex === index ? read : item))
            : [...list, read];
        return { ...current, [conversationId]: next };
      });
    })
      .then((unsubscribe) => {
        if (disposed) void unsubscribe();
        else unsubscribeReads = unsubscribe;
      })
      .catch(() => undefined);

    void subscribeToRealtimeStatus((status) => {
      if (disposed || status !== "connected") return;
      // The socket can miss events while it is reconnecting. Refetch once the
      // connection is restored instead of trying to replay an event log.
      if (hasConnected) {
        refreshConversations();
        const activeId = selectedIdRef.current;
        if (activeId) void loadConversation(activeId);
      }
      hasConnected = true;
    })
      .then((unsubscribe) => {
        if (disposed) void unsubscribe();
        else unsubscribeStatus = unsubscribe;
      })
      .catch(() => undefined);

    void subscribeToTypingIndicators((event) => {
      if (disposed) return;
      const conversationId = event.record?.conversation;
      const typingUserId = event.record?.user;
      if (!conversationId || !typingUserId) return;

      setTypingByConversation((current) => {
        const entries = { ...(current[conversationId] ?? {}) };
        if (event.action === "delete") {
          delete entries[typingUserId];
        } else if (event.typing) {
          entries[typingUserId] = event.typing.lastSeenIso;
        }
        return { ...current, [conversationId]: entries };
      });
    })
      .then((unsubscribe) => {
        if (disposed) void unsubscribe();
        else unsubscribeTyping = unsubscribe;
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
      if (unsubscribeReactions) {
        void unsubscribeReactions().catch(() => undefined);
      }
      if (unsubscribeReads) {
        void unsubscribeReads().catch(() => undefined);
      }
      if (unsubscribeTyping) {
        void unsubscribeTyping().catch(() => undefined);
      }
      if (unsubscribeStatus) {
        void unsubscribeStatus().catch(() => undefined);
      }
    };
  }, [userId]);

  async function persistRead(
    conversationId: string,
    message: Message | null,
    readAtIso?: string,
  ): Promise<void> {
    if (!userId) return;
    const targetAt = message?.createdAtIso ?? readAtIso;
    if (!targetAt) return;

    try {
      const read = await markConversationRead(
        conversationId,
        userId,
        message?.id ?? null,
        targetAt,
      );
      if (!read) return;

      setReadsByConversation((current) => {
        const list = current[conversationId] ?? [];
        const index = list.findIndex((item) => item.user.id === read.user.id);
        const next =
          index >= 0
            ? list.map((item, itemIndex) => (itemIndex === index ? read : item))
            : [...list, read];
        return { ...current, [conversationId]: next };
      });
    } catch {
      // Read receipts are best-effort; message delivery should not fail.
    }
  }

  function stopTyping() {
    if (typingClearTimerRef.current) {
      clearTimeout(typingClearTimerRef.current);
      typingClearTimerRef.current = null;
    }
    lastTypingSentRef.current = 0;

    const conversationId = typingConversationRef.current;
    typingConversationRef.current = null;
    if (!conversationId || !userId) return;

    setTypingByConversation((current) => {
      const entries = { ...(current[conversationId] ?? {}) };
      delete entries[userId];
      return { ...current, [conversationId]: entries };
    });
    void clearTypingIndicator(conversationId, userId).catch(() => undefined);
  }

  function noteTyping(conversationId: string) {
    if (!userId) return;

    if (
      typingConversationRef.current &&
      typingConversationRef.current !== conversationId
    ) {
      stopTyping();
    }
    typingConversationRef.current = conversationId;

    const now = Date.now();
    if (now - lastTypingSentRef.current > 2500) {
      lastTypingSentRef.current = now;
      void heartbeatTyping(conversationId, userId).catch(() => undefined);
    }

    if (typingClearTimerRef.current) {
      clearTimeout(typingClearTimerRef.current);
    }
    typingClearTimerRef.current = setTimeout(() => {
      stopTyping();
    }, 4000);
  }

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
    if (!userId) return;
    const now = new Date().toISOString();

    setReadAt(conversationId, now);
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

  async function loadConversation(conversationId: string) {
    if (!userId) return;
    const requestId = messageRequestRef.current + 1;
    messageRequestRef.current = requestId;

    setMessageError(null);
    setLoadingMessages(true);

    try {
      const [messages, reads, typing] = await Promise.all([
        fetchMessages(conversationId),
        fetchConversationReads(conversationId).catch(() => []),
        fetchTypingIndicators(conversationId).catch(() => []),
      ]);
      if (messageRequestRef.current !== requestId) return;

      setConversations((current) =>
        current.map((item) =>
          item.id === conversationId ? { ...item, messages } : item,
        ),
      );
      setReadsByConversation((current) => ({
        ...current,
        [conversationId]: reads,
      }));
      setTypingByConversation((current) => ({
        ...current,
        [conversationId]: Object.fromEntries(
          typing
            .filter((item) => item.userId !== userId)
            .map((item) => [item.userId, item.lastSeenIso]),
        ),
      }));

      if (messages.length > 0) {
        void persistRead(conversationId, messages[messages.length - 1]);
      }
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

  async function sendMessage(
    conversationId: string,
    body: string,
    replyToId: string | null = null,
  ): Promise<boolean> {
    if (!user) return false;
    const author = user;

    setSending(true);
    setMessageError(null);

    try {
      const created = await createMessage(
        conversationId,
        author.id,
        body,
        replyToId ?? undefined,
      );
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
      void persistRead(conversationId, message);
      return true;
    } catch (error) {
      setMessageError(describeError(error));
      return false;
    } finally {
      setSending(false);
    }
  }

  async function saveEditedMessage(
    conversationId: string,
    messageId: string,
    body: string,
  ): Promise<boolean> {
    setSending(true);
    setMessageError(null);

    try {
      const updated = await editMessage(messageId, body);
      setConversations((current) =>
        current.map((conversation) => {
          if (conversation.id !== conversationId) return conversation;
          const isLatest =
            conversation.messages[conversation.messages.length - 1]?.id ===
            messageId;
          return {
            ...conversation,
            messages: mergeMessage(conversation.messages, updated),
            ...(isLatest
              ? {
                  lastMessagePreview: updated.body,
                  lastMessageAt: updated.createdAtIso,
                  lastMessageAuthorId: updated.author.id,
                }
              : {}),
          };
        }),
      );
      return true;
    } catch (error) {
      setMessageError(describeError(error));
      return false;
    } finally {
      setSending(false);
    }
  }

  async function removeMessage(messageId: string): Promise<boolean> {
    setMessageError(null);
    try {
      await deleteMessage(messageId);
      setConversations((current) =>
        current.map((conversation) => ({
          ...conversation,
          messages: conversation.messages.filter(
            (message) => message.id !== messageId,
          ),
        })),
      );
      return true;
    } catch (error) {
      setMessageError(describeError(error));
      return false;
    }
  }

  function toggleReaction(message: Message, emoji: string) {
    if (!user) return;
    const mine = message.reactions.find(
      (reaction) =>
        reaction.user.id === user.id && reaction.emoji === emoji,
    );
    setMessageError(null);

    void (async () => {
      try {
        if (mine) {
          await removeReaction(mine.id);
          setConversations((current) =>
            current.map((conversation) => ({
              ...conversation,
              messages: removeReactionFromMessages(
                conversation.messages,
                mine.id,
              ),
            })),
          );
        } else {
          const reaction = await addReaction(message.id, user.id, emoji);
          setConversations((current) =>
            current.map((conversation) => ({
              ...conversation,
              messages: addReactionToMessages(
                conversation.messages,
                reaction,
              ),
            })),
          );
        }
      } catch (error) {
        setMessageError(describeError(error));
      }
    })();
  }

  async function copyMessage(message: Message): Promise<boolean> {
    try {
      await Clipboard.setStringAsync(message.body);
      return true;
    } catch (error) {
      setMessageError(describeError(error));
      return false;
    }
  }

  async function createConversation(person: Person): Promise<Conversation | null> {
    if (!user) return null;

    setCreatingConversation(true);
    setDataError(null);
    try {
      const conversation = await createDirectConversation(person, user);
      setConversations((current) => [conversation, ...current]);
      return conversation;
    } catch (error) {
      setDataError(describeError(error));
      return null;
    } finally {
      setCreatingConversation(false);
    }
  }

  function markAllRead() {
    if (!userId) return;
    const now = new Date().toISOString();

    for (const conversation of conversations) {
      setReadAt(conversation.id, now);
    }

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

    for (const conversation of conversations) {
      if (conversation.lastMessageAt) {
        void persistRead(conversation.id, null, conversation.lastMessageAt);
      }
    }
  }

  function markUnread(conversationId: string) {
    if (!userId) return;

    setReadAt(conversationId, null);
    setConversations((current) =>
      current.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        const unread =
          conversation.lastMessageAuthorId &&
          conversation.lastMessageAuthorId !== userId
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
  }

  async function deleteConversation(conversationId: string): Promise<boolean> {
    if (!userId) return false;
    setDataError(null);

    try {
      await removeConversation(conversationId);
      setConversations((current) =>
        current.filter((conversation) => conversation.id !== conversationId),
      );
      setReadAt(conversationId, null);
      return true;
    } catch (error) {
      setDataError(describeError(error));
      return false;
    }
  }

  async function refreshPeople() {
    if (!userId) return;
    setLoadingPeople(true);
    try {
      setPeople(await fetchPeople(userId));
    } catch (error) {
      setDataError(describeError(error));
    } finally {
      setLoadingPeople(false);
    }
  }

  return {
    conversations,
    people,
    loadingWorkspace,
    loadingPeople,
    loadingMessages,
    creatingConversation,
    dataError,
    messageError,
    sending,
    readsByConversation,
    typingByConversation,
    typingClock,
    loadWorkspace,
    loadConversation,
    sendMessage,
    saveEditedMessage,
    removeMessage,
    toggleReaction,
    copyMessage,
    createConversation,
    markAllRead,
    markUnread,
    deleteConversation,
    markRead,
    refreshPeople,
    noteTyping,
    stopTyping,
    setMessageError,
  };
}
