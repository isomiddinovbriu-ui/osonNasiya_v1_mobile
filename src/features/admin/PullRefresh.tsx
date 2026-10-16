import { type ReactNode } from "react";
import { RefreshControl, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import LoadingMark from "./LoadingMark";

export function PullRefreshControl({ refreshing, onRefresh, children, style }: { refreshing: boolean; onRefresh: () => void; children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <RefreshControl
    refreshing={refreshing}
    onRefresh={onRefresh}
    style={style}
    tintColor="transparent"
    colors={["transparent"]}
    progressBackgroundColor="transparent"
  >{children}</RefreshControl>;
}

export function PullRefreshFeedback({ active }: { active: boolean }) {
  if (!active) return null;
  return <View style={styles.feedback} accessibilityRole="progressbar" accessibilityLabel="Yangilanmoqda">
    <LoadingMark size={54} />
    <Text style={styles.label}>Yangilanmoqda...</Text>
  </View>;
}

const styles = StyleSheet.create({
  feedback: { alignItems: "center", paddingVertical: 12 },
  label: { color: "#627184", fontSize: 13, marginTop: 4 },
});
