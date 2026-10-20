export type Person = {
  id: string;
  name: string;
  initials: string;
  color: string;
};

export type Message = {
  id: string;
  author: Person;
  body: string;
  createdAt: string;
  unread?: boolean;
};

export type Conversation = {
  id: string;
  title: string;
  kind: "team" | "group" | "direct";
  participants: Person[];
  messages: Message[];
  unreadCount: number;
};

export const people: Person[] = [
  { id: "marcos", name: "Marcos", initials: "M", color: "#5B61D6" },
  { id: "sarah", name: "Sarah Chen", initials: "SC", color: "#D66B5B" },
  { id: "michael", name: "Michael Johnson", initials: "MJ", color: "#3A9B7A" },
  { id: "worship", name: "Worship Team", initials: "WT", color: "#B77B2F" },
];

export const initialConversations: Conversation[] = [
  {
    id: "worship-team",
    title: "Worship Team",
    kind: "team",
    participants: [people[1], people[2], people[3]],
    unreadCount: 2,
    messages: [
      {
        id: "worship-1",
        author: people[1],
        body: "I added the set list for this Sunday. Please review the transitions.",
        createdAt: "9:42 AM",
      },
      {
        id: "worship-2",
        author: people[2],
        body: "Looks great. I can bring the extra DI box.",
        createdAt: "9:47 AM",
        unread: true,
      },
    ],
  },
  {
    id: "sarah",
    title: "Sarah Chen",
    kind: "direct",
    participants: [people[1]],
    unreadCount: 0,
    messages: [
      {
        id: "sarah-1",
        author: people[1],
        body: "Could you confirm the rehearsal time?",
        createdAt: "Yesterday",
      },
    ],
  },
  {
    id: "service-planning",
    title: "Service Planning",
    kind: "group",
    participants: [people[1], people[2], people[3]],
    unreadCount: 5,
    messages: [
      {
        id: "planning-1",
        author: people[3],
        body: "The plan is ready for review.",
        createdAt: "Mon",
        unread: true,
      },
    ],
  },
];
