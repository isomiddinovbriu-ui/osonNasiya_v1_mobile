import { Fragment } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
};

export default function ListPagination({
  page,
  limit,
  total,
  onPageChange,
}: Props) {
  if (total <= 0) return null;
  const pages = Math.max(1, Math.ceil(total / limit));
  const numbers = [...new Set([1, page, pages])]
    .filter((number) => number >= 1 && number <= pages)
    .sort((left, right) => left - right);
  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  return (
    <View style={styles.container}>
      <Text style={styles.summary}>
        {total} ta mijozdan {first}–{last} · {page}/{pages} sahifa
      </Text>
      <View style={styles.navigation}>
        <Pressable
          style={[styles.button, page === 1 && styles.disabled]}
          disabled={page === 1}
          onPress={() => onPageChange(page - 1)}
          accessibilityRole="button"
          accessibilityLabel="Oldingi sahifa"
        >
          <Text style={styles.buttonText}>Oldingi</Text>
        </Pressable>
        <View style={styles.numbers}>
          {numbers.map((number, index) => (
            <Fragment key={number}>
              {index > 0 && number - numbers[index - 1] > 1 && (
                <Text
                  style={styles.ellipsis}
                  accessibilityLabel="Oradagi sahifalar"
                >
                  …
                </Text>
              )}
              <Pressable
                style={[styles.number, number === page && styles.selected]}
                onPress={() => onPageChange(number)}
                accessibilityRole="button"
                accessibilityLabel={`${number}-sahifa`}
                accessibilityState={{ selected: number === page }}
              >
                <Text
                  style={[
                    styles.numberText,
                    number === page && styles.selectedText,
                  ]}
                >
                  {number}
                </Text>
              </Pressable>
            </Fragment>
          ))}
        </View>
        <Pressable
          style={[styles.button, page === pages && styles.disabled]}
          disabled={page === pages}
          onPress={() => onPageChange(page + 1)}
          accessibilityRole="button"
          accessibilityLabel="Keyingi sahifa"
        >
          <Text style={styles.buttonText}>Keyingi</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    marginBottom: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  summary: {
    color: "#172536",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  navigation: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    marginTop: 12,
  },
  button: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "#EAF4FF",
  },
  buttonText: { color: "#1677D2", fontSize: 12, fontWeight: "700" },
  numbers: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    gap: 4,
  },
  number: {
    minWidth: 34,
    minHeight: 40,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 5,
    borderRadius: 8,
    backgroundColor: "#F2F5F9",
  },
  numberText: { color: "#1677D2", fontSize: 12, fontWeight: "700" },
  ellipsis: { color: "#627184", fontSize: 14, fontWeight: "700" },
  selected: { backgroundColor: "#1677D2" },
  selectedText: { color: "#FFFFFF" },
  disabled: { opacity: 0.4 },
});
