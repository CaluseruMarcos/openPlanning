export type Person = {
  id: string;
  name: string;
  initials: string;
  color: string;
};

export type Message = {
  id: string;
  conversationId: string;
  author: Person;
  body: string;
  createdAt: string;
  createdAtIso: string;
  unread?: boolean;
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
