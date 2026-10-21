import { Text, View } from "react-native";

import { styles } from "../styles";
import { avatarTone } from "../theme";
import type { Person } from "../types";

export function Avatar({
  person,
  size = 42,
}: {
  person: Person;
  size?: number;
}) {
  // Server colors came from the old indigo palette. Neutral cloth tones keep
  // every avatar inside the product palette instead.
  const tone = avatarTone(person.id);

  return (
    <View
      style={[
        styles.avatar,
        {
          backgroundColor: tone.background,
          height: size,
          width: size,
          borderRadius: size / 2,
        },
      ]}
    >
      <Text
        style={[
          styles.avatarText,
          { color: tone.foreground, fontSize: size * 0.34 },
        ]}
      >
        {person.initials}
      </Text>
    </View>
  );
}
