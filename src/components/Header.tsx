import Feather from "@expo/vector-icons/Feather";
import { Pressable, Text, View } from "react-native";

import { styles } from "../styles";
import { colors } from "../theme";

export function Header({
  title,
  onBack,
  action,
}: {
  title: string;
  onBack?: () => void;
  action?: {
    icon: keyof typeof Feather.glyphMap;
    onPress: () => void;
    accessibilityLabel: string;
  };
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerInner}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBack}
            style={styles.headerButton}
          >
            <Feather name="chevron-left" size={24} color={colors.ink} />
          </Pressable>
        ) : (
          <View style={styles.headerButton} />
        )}
        <Text numberOfLines={1} style={styles.headerTitle}>
          {title}
        </Text>
        {action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel}
            onPress={action.onPress}
            style={styles.headerButton}
          >
            <Feather name={action.icon} size={20} color={colors.ink} />
          </Pressable>
        ) : (
          <View style={styles.headerButton} />
        )}
      </View>
    </View>
  );
}
