export type Person = {
  id: string;
  name: string;
  initials: string;
  color: string;
};

export type Reaction = {
  id: string;
  messageId: string;
  emoji: string;
  user: Person;
  createdAtIso: string;
};

export type MessageReply = {
  id: string;
  author: Person;
  body: string;
};

export type Message = {
  id: string;
  conversationId: string;
  author: Person;
  body: string;
  createdAt: string;
  createdAtIso: string;
  editedAt?: string;
  replyTo?: MessageReply | null;
  reactions: Reaction[];
  unread?: boolean;
};

export type ConversationRead = {
  id: string;
  conversationId: string;
  user: Person;
  lastReadAt: string;
  lastReadMessageId?: string;
};

export type TypingIndicator = {
  conversationId: string;
  userId: string;
  lastSeenIso: string;
};

export type Conversation = {
  id: string;
  title: string;
  kind: "team" | "group" | "direct";
  participants: Person[];
  messages: Message[];
  unreadCount: number;
  createdBy: string;
  createdAt?: string;
  lastMessagePreview?: string;
  lastMessageAt?: string;
  lastMessageAuthorId?: string;
};

export type NotificationPref = "all" | "mentions" | "muted";
