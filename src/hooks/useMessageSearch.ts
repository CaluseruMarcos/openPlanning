import { useEffect, useState } from "react";

import { searchMessageConversations } from "../api/pocketbase";

export function useMessageSearch(userId: string, query: string) {
  const [messageSearchIds, setMessageSearchIds] = useState<
    Record<string, boolean>
  >({});
  const [searchingMessages, setSearchingMessages] = useState(false);

  useEffect(() => {
    const needle = query.trim();
    if (!userId || needle.length < 2) {
      setMessageSearchIds({});
      setSearchingMessages(false);
      return undefined;
    }

    let cancelled = false;
    setSearchingMessages(true);
    const timeout = setTimeout(async () => {
      try {
        const ids = await searchMessageConversations(needle);
        if (!cancelled) {
          setMessageSearchIds(Object.fromEntries(ids.map((id) => [id, true])));
        }
      } catch {
        if (!cancelled) setMessageSearchIds({});
      } finally {
        if (!cancelled) setSearchingMessages(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, userId]);

  return { messageSearchIds, searchingMessages };
}
