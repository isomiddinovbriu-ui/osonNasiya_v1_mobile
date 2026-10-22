import * as Location from "expo-location";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { YandexMapSurface, yandexMapUnavailableMessage } from "./YandexMapSurfaceLoader.native";

type Coordinates = { latitude: number; longitude: number };
const TASHKENT = { latitude: 41.2995, longitude: 69.2401 };

export default function LocationPicker({ visible, value, onClose, onSelect }: {
  visible: boolean; value: Coordinates | null; onClose: () => void; onSelect: (value: Coordinates) => void;
}) {
  const [picked, setPicked] = useState<Coordinates | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [currentLocationCenter, setCurrentLocationCenter] = useState<Coordinates | null>(null);
  const point = picked ?? value;
  const mapCenter = currentLocationCenter ?? value ?? TASHKENT;

  async function getCurrentLocation() {
    setBusy(true);
    setError("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setError("Joylashuvga ruxsat berilmadi. Xaritadan nuqtani tanlang.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coordinates = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setPicked(coordinates);
      setCurrentLocationCenter(coordinates);
    } catch {
      setError("Joriy joylashuv olinmadi. Xaritadan nuqtani tanlang.");
    } finally {
      setBusy(false);
    }
  }

  function close() { setPicked(null); setCurrentLocationCenter(null); setError(""); onClose(); }

  return <Modal visible={visible} animationType="slide" onRequestClose={close}>
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Manzilni belgilang</Text>
        <Pressable onPress={close} style={styles.cancelButton} accessibilityRole="button">
          <Text style={styles.cancelText}>Bekor qilish</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>Xaritadagi kerakli joyga bosing.</Text>
      {YandexMapSurface ? (
        <YandexMapSurface center={mapCenter} point={point} onSelect={(selected) => {
          setPicked(selected);
          setError("");
        }} />
      ) : <View style={styles.unavailable}><Text style={styles.unavailableText}>{yandexMapUnavailableMessage}</Text></View>}
      {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
      {point && <Text style={styles.coordinates}>{point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}</Text>}
      <View style={styles.footer}>
        <Pressable style={styles.secondary} onPress={() => void getCurrentLocation()} disabled={busy} accessibilityRole="button"><Text style={styles.link}>{busy ? "Olinmoqda..." : "Joriy joylashuv"}</Text></Pressable>
        <Pressable style={[styles.button, !point && styles.disabled]} onPress={() => { if (point) { onSelect(point); setPicked(null); setCurrentLocationCenter(null); } }} disabled={!point} accessibilityRole="button"><Text style={styles.buttonText}>Shu joyni tanlash</Text></Pressable>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF", paddingTop: 52 },
  header: { paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingBottom: 12 },
  title: { color: "#172536", fontSize: 19, fontWeight: "800" },
  cancelButton: { minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: "#C3333D", borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cancelText: { color: "#C3333D", fontSize: 14, fontWeight: "700" },
  hint: { color: "#627184", paddingHorizontal: 20, paddingBottom: 12 },
  unavailable: { flex: 1, justifyContent: "center", paddingHorizontal: 24, backgroundColor: "#F6F8FB" },
  unavailableText: { color: "#45586E", fontSize: 16, textAlign: "center", lineHeight: 24 },
  footer: { padding: 20, gap: 10 },
  secondary: { alignItems: "center", padding: 12 },
  link: { color: "#1677D2", fontWeight: "700", fontSize: 15 },
  button: { backgroundColor: "#1677D2", borderRadius: 12, padding: 15, alignItems: "center" },
  buttonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 16 },
  disabled: { opacity: 0.5 },
  error: { color: "#C3333D", paddingHorizontal: 20, paddingTop: 8 },
  coordinates: { color: "#45586E", paddingHorizontal: 20, paddingTop: 8 },
});
