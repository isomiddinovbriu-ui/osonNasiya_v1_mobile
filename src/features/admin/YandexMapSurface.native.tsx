import { Marker, YandexMapView } from "expo-yandex-mapkit";
import { StyleSheet } from "react-native";

type Coordinates = { latitude: number; longitude: number };

export default function YandexMapSurface({ center, point, onSelect }: {
  center: Coordinates;
  point?: Coordinates | null;
  onSelect?: (point: Coordinates) => void;
}) {
  return (
    <YandexMapView
      style={styles.map}
      cameraPosition={{ ...center, zoom: onSelect ? 14 : 12 }}
      interactiveDisabled={!onSelect}
      onMapPress={onSelect ? (event) => onSelect(event.nativeEvent.point) : undefined}
      onPoiTap={onSelect ? (event) => {
        if (event.nativeEvent.point) onSelect(event.nativeEvent.point);
      } : undefined}
    >
      {point && <Marker point={point} />}
    </YandexMapView>
  );
}

const styles = StyleSheet.create({ map: { flex: 1 } });
