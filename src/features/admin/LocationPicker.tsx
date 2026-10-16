import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

type Coordinates = { latitude: number; longitude: number };

export default function LocationPicker({ visible, onClose }: {
  visible: boolean; value: Coordinates | null; onClose: () => void; onSelect: (value: Coordinates) => void;
}) {
  return <Modal visible={visible} transparent onRequestClose={onClose}>
    <View style={styles.overlay}><View style={styles.card}>
      <Text style={styles.text}>Xarita mobil ilovada ishlaydi. Brauzerda koordinatalarni qo'lda kiriting.</Text>
      <Pressable onPress={onClose} accessibilityRole="button"><Text style={styles.link}>Yopish</Text></Pressable>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", backgroundColor: "#0008", padding: 24 },
  card: { backgroundColor: "white", borderRadius: 16, padding: 24, gap: 20 },
  text: { color: "#172536", fontSize: 16 },
  link: { color: "#1677D2", fontWeight: "700" },
});
