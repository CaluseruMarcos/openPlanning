import Feather from "@expo/vector-icons/Feather";
import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { styles } from "../styles";
import { colors } from "../theme";

export function SheetRow({
  label,
  hint,
  destructive,
  chevron,
  onPress,
}: {
  label: string;
  hint?: string;
  destructive?: boolean;
  chevron?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
    >
      <View style={styles.flex}>
        <Text style={[styles.sheetRowText, destructive && styles.dangerText]}>
          {label}
        </Text>
        {hint ? <Text style={styles.sheetRowHint}>{hint}</Text> : null}
      </View>
      {chevron ? (
        <Feather name="chevron-right" size={18} color={colors.faint} />
      ) : null}
    </Pressable>
  );
}

export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close menu"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{title}</Text>
          {children}
        </View>
      </View>
    </Modal>
  );
}
