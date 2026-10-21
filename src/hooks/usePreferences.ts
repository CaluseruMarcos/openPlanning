import { useEffect, useState } from "react";

import {
  defaultPreferences,
  loadPreferences,
  savePreferences,
  type Preferences,
} from "../storage/preferencesStore";

export function usePreferences() {
  const [preferences, setPreferences] =
    useState<Preferences>(defaultPreferences);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;

    void loadPreferences()
      .catch(() => defaultPreferences)
      .then((stored) => {
        if (!active) return;
        setPreferences(stored);
        setHydrated(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void savePreferences(preferences).catch(() => undefined);
  }, [preferences, hydrated]);

  return { preferences, setPreferences, hydrated };
}
