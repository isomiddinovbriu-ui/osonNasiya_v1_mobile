import { StyleSheet, View } from "react-native";
import MapView, { Marker } from "react-native-maps";

type Coordinates = { latitude: number; longitude: number };

export default function CurrentLocationPreview({ point }: { point: Coordinates }) {
  return <View style={styles.frame}>
    <MapView
      style={styles.map}
      region={{ ...point, latitudeDelta: 0.025, longitudeDelta: 0.025 }}
      scrollEnabled={false}
      zoomEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
      accessibilityLabel="Joriy joylashuv xaritasi"
    >
      <Marker coordinate={point} title="Sizning joylashuvingiz" />
    </MapView>
  </View>;
}

const styles = StyleSheet.create({
  frame: { height: 170, borderRadius: 12, overflow: "hidden", marginTop: 12 },
  map: { flex: 1 },
});
