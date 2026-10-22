import { StyleSheet, Text, View } from "react-native";
import { YandexMapSurface, yandexMapUnavailableMessage } from "./YandexMapSurfaceLoader.native";

type Coordinates = { latitude: number; longitude: number };

export default function CurrentLocationPreview({ point }: { point: Coordinates }) {
  return <View style={styles.frame}>
    {YandexMapSurface ? <YandexMapSurface center={point} point={point} /> : (
      <View style={styles.unavailable}><Text style={styles.unavailableText}>{yandexMapUnavailableMessage}</Text></View>
    )}
  </View>;
}

const styles = StyleSheet.create({
  frame: { height: 170, borderRadius: 12, overflow: "hidden", marginTop: 12 },
  unavailable: { flex: 1, justifyContent: "center", paddingHorizontal: 16, backgroundColor: "#F6F8FB" },
  unavailableText: { color: "#45586E", textAlign: "center" },
});
