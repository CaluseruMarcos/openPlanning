import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Conversation } from "../data/mockData";

const SESSION_KEY = "open-services-session";
const CONVERSATIONS_KEY = "open-services-conversations-v1";

export type Session = {
  displayName: string;
  signedIn: boolean;
};

const defaultSession: Session = {
  displayName: "Marcos",
  signedIn: true,
};

export async function loadSession(): Promise<Session> {
  const serialized = await AsyncStorage.getItem(SESSION_KEY);
  if (!serialized) {
    return defaultSession;
  }

  try {
    const parsed = JSON.parse(serialized) as Partial<Session>;
    return {
      displayName: typeof parsed.displayName === "string" ? parsed.displayName : defaultSession.displayName,
      signedIn: typeof parsed.signedIn === "boolean" ? parsed.signedIn : defaultSession.signedIn,
    };
  } catch {
    return defaultSession;
  }
}

export async function saveSession(session: Session): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function loadConversations(): Promise<Conversation[] | null> {
  const serialized = await AsyncStorage.getItem(CONVERSATIONS_KEY);
  if (!serialized) {
    return null;
  }

  try {
    const parsed = JSON.parse(serialized);
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed as Conversation[];
  } catch {
    return null;
  }
}

export async function saveConversations(conversations: Conversation[]): Promise<void> {
  await AsyncStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
}

export async function clearConversations(): Promise<void> {
  await AsyncStorage.removeItem(CONVERSATIONS_KEY);
}
