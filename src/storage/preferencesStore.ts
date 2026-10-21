import AsyncStorage from "@react-native-async-storage/async-storage";

import type { NotificationPref } from "../types";

const PREFERENCES_KEY = "open-services-preferences-v1";

export type Preferences = {
  readAtByUser: Record<string, Record<string, string>>;
  mutedByUser: Record<string, Record<string, boolean>>;
  notificationPrefByUser: Record<string, NotificationPref>;
};

export const defaultPreferences: Preferences = {
  readAtByUser: {},
  mutedByUser: {},
  notificationPrefByUser: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function loadPreferences(): Promise<Preferences> {
  const serialized = await AsyncStorage.getItem(PREFERENCES_KEY);
  if (!serialized) {
    return defaultPreferences;
  }

  try {
    const parsed = JSON.parse(serialized) as unknown;
    if (!isRecord(parsed)) {
      return defaultPreferences;
    }

    const readAtByUser = isRecord(parsed.readAtByUser) ? parsed.readAtByUser : {};
    const mutedByUser = isRecord(parsed.mutedByUser) ? parsed.mutedByUser : {};
    const notificationPrefByUser = isRecord(parsed.notificationPrefByUser)
      ? parsed.notificationPrefByUser
      : {};

    return {
      readAtByUser: readAtByUser as Preferences["readAtByUser"],
      mutedByUser: mutedByUser as Preferences["mutedByUser"],
      notificationPrefByUser:
        notificationPrefByUser as Preferences["notificationPrefByUser"],
    };
  } catch {
    return defaultPreferences;
  }
}

export async function savePreferences(preferences: Preferences): Promise<void> {
  await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
}
