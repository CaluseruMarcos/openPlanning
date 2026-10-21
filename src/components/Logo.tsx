import { Image, type ImageStyle, type StyleProp } from "react-native";

import logo from "../../assets/logo.png";

export function Logo({
  size = 72,
  style,
}: {
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={logo}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="Open Services"
    />
  );
}
