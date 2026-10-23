import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

type Coordinates = { latitude: number; longitude: number };

export default function LocationPicker({ visible, value, onClose, onSelect }: {
  visible: boolean; value: Coordinates | null; onClose: () => void; onSelect: (value: Coordinates) => void;
}) {
  return visible ? <CoordinatePicker value={value} onClose={onClose} onSelect={onSelect} /> : null;
}

function CoordinatePicker({ value, onClose, onSelect }: {
  value: Coordinates | null; onClose: () => void; onSelect: (value: Coordinates) => void;
}) {
  const [latitude, setLatitude] = useState(value ? String(value.latitude) : "");
  const [longitude, setLongitude] = useState(value ? String(value.longitude) : "");
  const [error, setError] = useState("");

  function select() {
    const lat = Number(latitude.trim().replace(",", "."));
    const long = Number(longitude.trim().replace(",", "."));
    if (!latitude.trim() || !longitude.trim() || !Number.isFinite(lat) || !Number.isFinite(long) || lat < -90 || lat > 90 || long < -180 || long > 180) {
      setError("Lat -90 dan 90 gacha, long -180 dan 180 gacha bo'lishi kerak.");
      return;
    }
    onSelect({ latitude: lat, longitude: long });
  }

  return <Modal visible transparent onRequestClose={onClose}>
    <View style={styles.overlay}><View style={styles.card}>
      <Text style={styles.text}>Xarita mobil ilovada ishlaydi. Brauzerda koordinatalarni qo&apos;lda kiriting.</Text>
      <TextInput style={styles.input} value={latitude} onChangeText={setLatitude} placeholder="Lat, masalan 41.2995" keyboardType="numbers-and-punctuation" accessibilityLabel="Latitude" />
      <TextInput style={styles.input} value={longitude} onChangeText={setLongitude} placeholder="Long, masalan 69.2401" keyboardType="numbers-and-punctuation" accessibilityLabel="Longitude" />
      {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
      <View style={styles.actions}>
        <Pressable onPress={onClose} accessibilityRole="button"><Text style={styles.link}>Yopish</Text></Pressable>
        <Pressable onPress={select} accessibilityRole="button"><Text style={styles.link}>Shu joyni tanlash</Text></Pressable>
      </View>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", backgroundColor: "#0008", padding: 24 },
  card: { backgroundColor: "white", borderRadius: 16, padding: 24, gap: 20 },
  text: { color: "#172536", fontSize: 16 },
  input: { minHeight: 44, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 9, paddingHorizontal: 12, color: "#172536" },
  error: { color: "#C3333D", fontSize: 13 },
  actions: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  link: { color: "#1677D2", fontWeight: "700" },
});
