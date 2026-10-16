import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import CurrentLocationPreview from "./CurrentLocationPreview";

export type Coordinates = { latitude: number; longitude: number };
const defaultLatitude = "41.311081";
const defaultLongitude = "69.240562";

type Props = {
  point: Coordinates | null;
  address: string;
  radiusMeters: number;
  busy: boolean;
  error: string;
  active: boolean;
  onLocate: () => void;
  onManualLocation: (point: Coordinates, radiusMeters: number) => void;
  onRadiusChange: (radiusMeters: number) => void;
  onClear: () => void;
};

export default function NearbyLocationFilter({
  point, address, radiusMeters, busy, error, active,
  onLocate, onManualLocation, onRadiusChange, onClear,
}: Props) {
  const [manualLat, setManualLat] = useState(defaultLatitude);
  const [manualLong, setManualLong] = useState(defaultLongitude);
  const [manualError, setManualError] = useState("");
  const [customRadius, setCustomRadius] = useState(String(radiusMeters));
  const [radiusError, setRadiusError] = useState("");
  const [manualOpen, setManualOpen] = useState(false);

  function applyRadius() {
    const meters = Number(customRadius.trim());
    if (!customRadius.trim() || !Number.isSafeInteger(meters) || meters < 1 || meters > 100000) {
      setRadiusError("1 dan 100 000 metrgacha butun son kiriting.");
      return;
    }
    setRadiusError("");
    onRadiusChange(meters);
  }

  function applyManual() {
    const latitude = Number(manualLat.trim().replace(",", "."));
    const longitude = Number(manualLong.trim().replace(",", "."));
    const meters = Number(customRadius.trim());
    if (
      !manualLat.trim() || !manualLong.trim() ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
    ) {
      setManualError("Lat -90 dan 90 gacha, long -180 dan 180 gacha bo'lishi kerak.");
      return;
    }
    if (!customRadius.trim() || !Number.isSafeInteger(meters) || meters < 1 || meters > 100000) {
      setRadiusError("1 dan 100 000 metrgacha butun son kiriting.");
      return;
    }
    setManualError("");
    setRadiusError("");
    onManualLocation({ latitude, longitude }, meters);
    setManualOpen(false);
  }

  function clear() {
    setManualLat(defaultLatitude);
    setManualLong(defaultLongitude);
    setManualError("");
    setCustomRadius(String(radiusMeters));
    setRadiusError("");
    setManualOpen(false);
    onClear();
  }

  return (
    <View style={styles.content}>
      <Text style={styles.hint}>Joylashuvingizni aniqlab, shu atrofdagi mijozlarni toping.</Text>
      {busy && <Text style={styles.hint}>Joylashuv aniqlanmoqda...</Text>}
      {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
      {point && (
        <>
          <CurrentLocationPreview point={point} />
          {!!address && <Text style={styles.address}>{address}</Text>}
          <Text style={styles.coordinates}>{point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}</Text>
        </>
      )}
      <Text style={styles.label}>Qidiruv radiusi</Text>
      <View style={styles.options}>
        {[1, 3, 5, 7, 10, 30].map((kilometers) => {
          const radius = kilometers * 1000;
          const selected = Number(customRadius) === radius;
          return (
              <Pressable
                key={radius}
                style={[styles.option, selected && styles.optionSelected]}
                onPress={() => { setCustomRadius(String(radius)); setRadiusError(""); }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{kilometers} km</Text>
              </Pressable>
          );
        })}
      </View>
      <View style={styles.radiusRow}>
        <TextInput
              style={[styles.input, styles.radiusInput]}
              value={customRadius}
              onChangeText={(value) => { setCustomRadius(value); setRadiusError(""); }}
              placeholder="Boshqa masofa (metr)"
              keyboardType="number-pad"
              maxLength={6}
              accessibilityLabel="Qidiruv radiusi metrda"
        />
        <Pressable style={styles.radiusButton} onPress={applyRadius} accessibilityRole="button"><Text style={styles.manualButtonText}>Qo'llash</Text></Pressable>
      </View>
      {!!radiusError && <Text style={styles.error} accessibilityRole="alert">{radiusError}</Text>}
      <Text style={styles.hint}>Amaldagi radius: {radiusMeters.toLocaleString("uz-UZ")} metr. Yangi masofa uchun Qo'llashni bosing.</Text>
      <Pressable style={styles.refresh} onPress={onLocate} disabled={busy} accessibilityRole="button">
        <Text style={styles.link}>{point ? "Joylashuvni yangilash" : "Joriy joylashuvni olish"}</Text>
      </Pressable>

      <Pressable style={styles.manualToggle} onPress={() => setManualOpen((open) => !open)} accessibilityRole="button" accessibilityState={{ expanded: manualOpen }}>
        <Text style={styles.link}>Koordinatani qo'lda kiritish {manualOpen ? "−" : "+"}</Text>
      </Pressable>
      {manualOpen && <View style={styles.manualSection}>
        <Text style={styles.label}>Koordinatalar</Text>
        <View style={styles.manualRow}>
          <View style={styles.manualField}>
            <Text style={styles.fieldLabel}>Lat</Text>
            <TextInput
              style={styles.input}
              value={manualLat}
              onChangeText={(value) => { setManualLat(value); setManualError(""); }}
              placeholder="41.311081"
              keyboardType="numbers-and-punctuation"
              autoCorrect={false}
              accessibilityLabel="Test uchun latitude"
            />
          </View>
          <View style={styles.manualField}>
            <Text style={styles.fieldLabel}>Long</Text>
            <TextInput
              style={styles.input}
              value={manualLong}
              onChangeText={(value) => { setManualLong(value); setManualError(""); }}
              placeholder="69.240562"
              keyboardType="numbers-and-punctuation"
              autoCorrect={false}
              accessibilityLabel="Test uchun longitude"
            />
          </View>
        </View>
        {!!manualError && <Text style={styles.error} accessibilityRole="alert">{manualError}</Text>}
        <Pressable style={styles.manualButton} onPress={applyManual} accessibilityRole="button">
          <Text style={styles.manualButtonText}>Koordinatalar bilan tekshirish</Text>
        </Pressable>
      </View>}

      {active && <Pressable style={styles.clear} onPress={clear} accessibilityRole="button"><Text style={styles.link}>Lokatsiya filtrini tozalash</Text></Pressable>}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 12 },
  hint: { color: "#627184", fontSize: 13, lineHeight: 19, marginTop: 6 },
  error: { color: "#C3333D", fontSize: 13, lineHeight: 19, marginTop: 10 },
  address: { color: "#172536", fontSize: 14, fontWeight: "700", marginTop: 12 },
  coordinates: { color: "#627184", fontSize: 13, marginTop: 6 },
  label: { color: "#172536", fontSize: 14, fontWeight: "700", marginTop: 17, marginBottom: 8 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: { borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16, backgroundColor: "#FFFFFF" },
  optionSelected: { borderColor: "#1677D2", backgroundColor: "#EAF4FF" },
  optionText: { color: "#45586E", fontSize: 13, fontWeight: "700" },
  optionTextSelected: { color: "#1677D2" },
  refresh: { minHeight: 44, borderRadius: 10, backgroundColor: "#EAF4FF", alignItems: "center", justifyContent: "center", marginTop: 14 },
  manualSection: { marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: "#F4F7FA" },
  manualToggle: { alignSelf: "flex-start", paddingVertical: 12, marginTop: 8 },
  manualRow: { flexDirection: "row", gap: 10 },
  manualField: { flex: 1 },
  fieldLabel: { color: "#45586E", fontSize: 12, fontWeight: "700", marginBottom: 6 },
  input: { borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 9, backgroundColor: "#FFFFFF", color: "#172536", paddingHorizontal: 10, minHeight: 42 },
  radiusRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  radiusInput: { flex: 1, minWidth: 0 },
  radiusButton: { minHeight: 42, borderRadius: 9, backgroundColor: "#1677D2", alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  manualButton: { minHeight: 42, borderRadius: 9, backgroundColor: "#1677D2", alignItems: "center", justifyContent: "center", marginTop: 10 },
  manualButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  clear: { alignSelf: "center", paddingVertical: 12, marginTop: 2 },
  link: { color: "#1677D2", fontSize: 13, fontWeight: "700" },
});
