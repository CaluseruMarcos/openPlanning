import Feather from "@expo/vector-icons/Feather";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { styles } from "../styles";
import { colors } from "../theme";

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.emptyState}>
      <Feather name="inbox" size={26} color={colors.accentDeep} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

export function LoadingInline({ label }: { label: string }) {
  return (
    <View style={styles.loadingInline}>
      <ActivityIndicator color={colors.accentDeep} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorBannerText}>{message}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={8}>
          <Text style={styles.errorRetry}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
