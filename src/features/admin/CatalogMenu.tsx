import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

const links = [
  {
    title: "Guruhlar",
    icon: "▦",
    href: "/catalog/groups",
  },
  {
    title: "Bo‘limlar",
    icon: "☷",
    href: "/catalog/sections",
  },
  {
    title: "Mahsulotlar",
    icon: "▣",
    href: "/catalog/products",
  },
] as const;

export default function CatalogMenu() {
  return (
    <View style={styles.links}>
      {links.map((link) => (
        <Pressable
          key={link.href}
          style={styles.link}
          onPress={() => router.push(link.href)}
          accessibilityRole="button"
          accessibilityLabel={link.title}
        >
          <Text style={styles.icon}>{link.icon}</Text>
          <Text style={styles.title}>{link.title}</Text>
          <Text style={styles.arrow}>›</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  links: { gap: 8, marginBottom: 24 },
  link: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8EDF3",
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  icon: {
    width: 38,
    height: 38,
    textAlign: "center",
    textAlignVertical: "center",
    overflow: "hidden",
    borderRadius: 10,
    backgroundColor: "#EAF4FF",
    color: "#1677D2",
    fontSize: 21,
    fontWeight: "700",
  },
  title: { flex: 1, color: "#172536", fontSize: 16, fontWeight: "700" },
  arrow: { color: "#1677D2", fontSize: 30, lineHeight: 32 },
});
