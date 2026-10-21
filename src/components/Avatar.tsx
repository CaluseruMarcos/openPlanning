import { Text, View } from "react-native";

import { styles } from "../styles";
import type { Person } from "../types";

export function Avatar({
  person,
  size = 42,
}: {
  person: Person;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.avatar,
        {
          backgroundColor: person.color,
          height: size,
          width: size,
          borderRadius: size / 2,
        },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.34 }]}>
        {person.initials}
      </Text>
    </View>
  );
}
