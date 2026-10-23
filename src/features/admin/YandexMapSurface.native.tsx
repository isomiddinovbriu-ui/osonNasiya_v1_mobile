import { initialize, Marker, YandexMapView } from "expo-yandex-mapkit";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

type Coordinates = { latitude: number; longitude: number };

export default function YandexMapSurface({
  center,
  point,
  onSelect,
}: {
  center: Coordinates;
  point?: Coordinates | null;
  onSelect?: (point: Coordinates) => void;
}) {
  const apiKey = process.env.EXPO_PUBLIC_YANDEX_MAPKIT_API_KEY?.trim();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!apiKey) return;

    let mounted = true;
    initialize(apiKey)
      .then(() => {
        if (mounted) setReady(true);
      })
      .catch(() => {
        if (mounted)
          setError(
            "Yandex xaritasi ishga tushmadi. MapKit kalitini tekshiring.",
          );
      });
    return () => {
      mounted = false;
    };
  }, [apiKey]);

  if (!ready) {
    const message = !apiKey
      ? "Yandex MapKit kaliti topilmadi. .env faylini tekshirib, Metro serverini qayta ishga tushiring."
      : error || "Yandex xaritasi yuklanmoqda...";
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>{message}</Text>
      </View>
    );
  }

  return (
    <YandexMapView
      style={styles.map}
      cameraPosition={{ ...center, zoom: onSelect ? 14 : 12 }}
      interactiveDisabled={!onSelect}
      onMapPress={
        onSelect ? (event) => onSelect(event.nativeEvent.point) : undefined
      }
      onPoiTap={
        onSelect
          ? (event) => {
              if (event.nativeEvent.point) onSelect(event.nativeEvent.point);
            }
          : undefined
      }
    >
      {point && <Marker point={point} />}
    </YandexMapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  placeholder: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#F6F8FB",
  },
  placeholderText: {
    color: "#45586E",
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
});
