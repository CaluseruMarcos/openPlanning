import { parsePocketBaseDate } from "../api/pocketbase";
import type {
  Conversation,
  ConversationRead,
  Message,
  Person,
  Reaction,
} from "../types";

export function unreadForConversation(
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

export function applyUnread(
  conversations: Conversation[],
  readAt: Record<string, string>,
  currentUserId: string,
): Conversation[] {
  return conversations.map((conversation) => ({
    ...conversation,
    unreadCount: unreadForConversation(conversation, readAt, currentUserId),
  }));
}

export function mergeMessage(messages: Message[], message: Message): Message[] {
  const index = messages.findIndex((item) => item.id === message.id);
  if (index >= 0) {
    const next = [...messages];
    const existing = next[index];
    next[index] = {
      ...existing,
      ...message,
      // Realtime message updates do not carry reactions; keep the ones already
      // loaded unless a full fetch deliberately supplied some.
      reactions:
        message.reactions.length > 0 ? message.reactions : existing.reactions,
      unread: existing.unread,
    };
    return next;
  }
  return [...messages, message].sort((left, right) =>
    left.createdAtIso.localeCompare(right.createdAtIso),
  );
}

export function addReactionToMessages(
  messages: Message[],
  reaction: Reaction,
): Message[] {
  return messages.map((message) => {
    if (message.id !== reaction.messageId) return message;
    if (message.reactions.some((item) => item.id === reaction.id)) return message;
    return { ...message, reactions: [...message.reactions, reaction] };
  });
}

export function removeReactionFromMessages(
  messages: Message[],
  reactionId: string,
): Message[] {
  return messages.map((message) =>
    message.reactions.some((item) => item.id === reactionId)
      ? {
          ...message,
          reactions: message.reactions.filter((item) => item.id !== reactionId),
        }
      : message,
  );
}

export function summarizeReactions(
  reactions: Reaction[],
  meId: string,
): { emoji: string; count: number; mine: boolean }[] {
  const summaries = new Map<
    string,
    { emoji: string; count: number; mine: boolean }
  >();

  for (const reaction of reactions) {
    const summary = summaries.get(reaction.emoji) ?? {
      emoji: reaction.emoji,
      count: 0,
      mine: false,
    };
    summary.count += 1;
    if (reaction.user.id === meId) summary.mine = true;
    summaries.set(reaction.emoji, summary);
  }

  return [...summaries.values()];
}

export function readCoversMessage(
  read: ConversationRead,
  message: Message,
): boolean {
  const readAt = parsePocketBaseDate(read.lastReadAt)?.getTime() ?? 0;
  const messageAt = parsePocketBaseDate(message.createdAtIso)?.getTime() ?? 0;
  return readAt >= messageAt;
}

export function firstNames(people: Person[]): string {
  return people
    .map((person) => person.name.trim().split(/\s+/)[0] || person.name)
    .join(", ");
}

export function unreadTotal(conversations: Conversation[]): number {
  return conversations.reduce(
    (total, conversation) => total + conversation.unreadCount,
    0,
  );
}
