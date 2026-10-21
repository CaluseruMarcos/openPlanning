import type { ReactNode } from "react";
import { View } from "react-native";

import { styles } from "../styles";

/** Chrome band at the top of tab screens. The band spans the window while its
 * content stays on the app column, so wide browser windows keep their layout. */
export function ScreenHeader({ children }: { children: ReactNode }) {
  return (
    <View style={styles.screenHeader}>
      <View style={styles.screenHeaderInner}>{children}</View>
    </View>
  );
}
