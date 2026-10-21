import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { styles } from "../styles";
import type { Tab } from "../types";

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
  const items: [Tab, string, string][] = [
    ["chat", "▤", "Chat"],
    ["activity", "◷", "Activity"],
    ["profile", "◎", "Profile"],
  ];

  return (
    <View style={[styles.bottomTabs, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {items.map(([value, icon, label]) => {
        const active = tab === value;
        return (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={label}
            onPress={() => onChange(value)}
            style={styles.tab}
          >
            <View style={styles.tabIconWrap}>
              <Text style={[styles.tabIcon, active && styles.tabIconActive]}>
                {icon}
              </Text>
              {value === "chat" && unread > 0 ? (
                <Text style={styles.tabBadge}>{unread}</Text>
              ) : null}
            </View>
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
