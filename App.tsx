import { useFonts } from "expo-font";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppShell } from "./src/AppShell";
import { colors } from "./src/theme";

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_600SemiBold: require("./assets/fonts/Fraunces-SemiBold.ttf"),
    HankenGrotesk_400Regular: require("./assets/fonts/HankenGrotesk-Regular.ttf"),
    HankenGrotesk_500Medium: require("./assets/fonts/HankenGrotesk-Medium.ttf"),
    HankenGrotesk_600SemiBold: require("./assets/fonts/HankenGrotesk-SemiBold.ttf"),
    HankenGrotesk_700Bold: require("./assets/fonts/HankenGrotesk-Bold.ttf"),
  });

  // A missing font should fall back to the platform face rather than block the
  // whole app, so only the loading window is held back.
  if (!fontsLoaded && !fontError) {
    return <View style={{ backgroundColor: colors.canvas, flex: 1 }} />;
  }

  return (
    <SafeAreaProvider>
      <AppShell />
    </SafeAreaProvider>
  );
}
