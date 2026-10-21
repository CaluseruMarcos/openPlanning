import Feather from "@expo/vector-icons/Feather";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { styles } from "../styles";
import { colors } from "../theme";
import type { Tab } from "../types";

const items: [Tab, keyof typeof Feather.glyphMap, string][] = [
  ["chat", "message-square", "Chat"],
  ["activity", "bell", "Activity"],
  ["profile", "user", "Profile"],
];

export function BottomTabs({
  tab,
  unread,
  onChange,
}: {
  tab: Tab;
  unread: number;
  onChange: (tab: Tab) => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bottomTabs,
        { paddingBottom: Math.max(insets.bottom, 8) },
      ]}
    >
      <View style={styles.tabsInner}>
        {items.map(([value, icon, label]) => {
          const active = tab === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
              onPress={() => onChange(value)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <View style={styles.tabIconWrap}>
                <Feather
                  name={icon}
                  size={20}
                  color={active ? colors.accentDeep : colors.chromeSoft}
                />
                {value === "chat" && unread > 0 ? (
                  <Text style={styles.tabBadge}>
                    {unread > 99 ? "99+" : unread}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
