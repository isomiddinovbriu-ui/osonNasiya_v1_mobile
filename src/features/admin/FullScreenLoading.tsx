import { BlurTargetView, BlurView } from "expo-blur";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import LoadingMark from "./LoadingMark";

export type DeleteConfirmation = { message: string; subject?: string; detail?: string; disabled?: boolean; onConfirm: () => void };

type SuccessToastData = { id: number; message: string };
type Props = { active: boolean; message: string; children: ReactNode; confirmation?: DeleteConfirmation | null; onCancelConfirmation?: () => void; successToast?: SuccessToastData | null; onSuccessDismiss?: (id: number) => void };

export default function FullScreenLoading({ active, message, children, confirmation, onCancelConfirmation, successToast, onSuccessDismiss }: Props) {
  const targetRef = useRef<View | null>(null);

  return <View style={styles.screen}>
    <BlurTargetView ref={targetRef} style={styles.screen}>{children}</BlurTargetView>
    {!!confirmation && <View style={styles.overlay} accessibilityViewIsModal>
      <BlurView blurTarget={targetRef} blurMethod="dimezisBlurView" intensity={75} tint="light" style={StyleSheet.absoluteFill} />
      <Pressable style={styles.confirmScrim} onPress={onCancelConfirmation} accessibilityRole="button" accessibilityLabel="O'chirish oynasini yopish" />
      <View style={styles.confirmCard}>
        <Text style={styles.confirmTitle}>{confirmation.message}</Text>
        {!!confirmation.subject && <Text style={styles.confirmSubject}>“{confirmation.subject}”</Text>}
        {!!confirmation.detail && <Text style={styles.confirmDetail}>{confirmation.detail}</Text>}
        <View style={styles.confirmActions}>
          <Pressable style={[styles.confirmAction, styles.cancelAction]} onPress={onCancelConfirmation} accessibilityRole="button">
            <Text style={styles.confirmActionText}>Yo‘q</Text>
          </Pressable>
          <Pressable style={[styles.confirmAction, styles.deleteAction, confirmation.disabled && styles.disabledAction]} onPress={confirmation.onConfirm} disabled={confirmation.disabled} accessibilityRole="button">
            <Text style={styles.confirmActionText}>Ha, o‘chirish</Text>
          </Pressable>
        </View>
      </View>
    </View>}
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
    {!active && successToast && <SuccessToast key={successToast.id} toast={successToast} onDismiss={onSuccessDismiss} />}
  </View>;
}

function SuccessToast({ toast, onDismiss }: { toast: SuccessToastData; onDismiss?: (id: number) => void }) {
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(progress, { toValue: 0, duration: 240, useNativeDriver: true }).start(({ finished }) => {
        if (finished) onDismiss?.(toast.id);
      });
    }, 2700);
    return () => {
      clearTimeout(timer);
      progress.stopAnimation();
    };
  }, [onDismiss, progress, toast.id]);

  return <Animated.View
    pointerEvents="none"
    style={[styles.successToast, { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-70, 0] }) }] }]}
  >
    <View style={styles.successIcon}><Text style={styles.successCheck}>✓</Text></View>
    <Text style={styles.successText} accessibilityRole="alert">{toast.message}</Text>
  </Animated.View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  overlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", zIndex: 10 },
  successToast: { position: "absolute", top: 18, alignSelf: "center", maxWidth: "90%", flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, backgroundColor: "#FFFFFF", shadowColor: "#263A52", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 12, zIndex: 20 },
  successIcon: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#39BF20" },
  successCheck: { color: "#FFFFFF", fontSize: 13, fontWeight: "800", lineHeight: 18 },
  successText: { color: "#172536", fontSize: 14, fontWeight: "600" },
  confirmScrim: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(23, 37, 54, 0.18)" },
  confirmCard: { width: "84%", maxWidth: 340, padding: 24, borderRadius: 22, backgroundColor: "#FFFFFF", alignItems: "center", shadowColor: "#263A52", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.16, shadowRadius: 24, elevation: 10 },
  confirmTitle: { color: "#172536", fontSize: 20, fontWeight: "800", textAlign: "center" },
  confirmSubject: { color: "#1677D2", fontSize: 18, fontWeight: "800", textAlign: "center", marginTop: 10 },
  confirmDetail: { color: "#627184", fontSize: 14, lineHeight: 20, textAlign: "center", marginTop: 10 },
  confirmActions: { width: "100%", flexDirection: "row", gap: 12, marginTop: 24 },
  confirmAction: { flex: 1, minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  cancelAction: { backgroundColor: "#1677D2" },
  deleteAction: { backgroundColor: "#D33B45" },
  disabledAction: { opacity: 0.45 },
  confirmActionText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700", textAlign: "center" },
  scrim: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(246, 248, 251, 0.34)" },
  card: { width: "78%", maxWidth: 320, alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 24, paddingVertical: 30, paddingHorizontal: 20, shadowColor: "#263A52", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.16, shadowRadius: 24, elevation: 10 },
  title: { color: "#172536", fontSize: 23, fontWeight: "800", marginTop: 8, textAlign: "center" },
  hint: { color: "#627184", fontSize: 14, marginTop: 6 },
});
