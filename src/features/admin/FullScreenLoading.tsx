import { BlurTargetView, BlurView } from "expo-blur";
import { type ReactNode, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import LoadingMark from "./LoadingMark";

type Props = { active: boolean; message: string; children: ReactNode };

export default function FullScreenLoading({ active, message, children }: Props) {
  const targetRef = useRef<View | null>(null);

  return <View style={styles.screen}>
    <BlurTargetView ref={targetRef} style={styles.screen}>{children}</BlurTargetView>
    {active && <View style={styles.overlay} accessibilityViewIsModal>
      <BlurView
        blurTarget={targetRef}
        blurMethod="dimezisBlurView"
        intensity={75}
        tint="light"
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.scrim} />
      <View style={styles.card} accessibilityRole="progressbar" accessibilityLabel={message}>
        <LoadingMark size={118} />
        <Text style={styles.title}>{message}</Text>
        <Text style={styles.hint}>Iltimos, kuting</Text>
      </View>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  overlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", zIndex: 10 },
  scrim: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(246, 248, 251, 0.34)" },
  card: { width: "78%", maxWidth: 320, alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 24, paddingVertical: 30, paddingHorizontal: 20, shadowColor: "#263A52", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.16, shadowRadius: 24, elevation: 10 },
  title: { color: "#172536", fontSize: 23, fontWeight: "800", marginTop: 8, textAlign: "center" },
  hint: { color: "#627184", fontSize: 14, marginTop: 6 },
});
