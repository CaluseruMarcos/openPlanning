import { Image, type ImageStyle, type StyleProp } from "react-native";

import logoInk from "../../assets/logo-ink.png";
import logoPaper from "../../assets/logo-paper.png";

const sources = { ink: logoInk, paper: logoPaper } as const;

export function Logo({
  size = 72,
  tone = "ink",
  style,
}: {
  size?: number;
  tone?: keyof typeof sources;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={sources[tone]}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="Open Services"
    />
  );
}
