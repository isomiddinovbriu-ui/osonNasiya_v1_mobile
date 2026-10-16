import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

const links = [
  { title: "Guruhlar uchun amallar", description: "Guruhlarni yarating va boshqaring", icon: "▦", href: "/catalog/groups" },
  { title: "Bo'limlar uchun amallar", description: "Guruh bo'yicha bo'limlarni boshqaring", icon: "☷", href: "/catalog/sections" },
  { title: "Mahsulotlar uchun amallar", description: "Mahsulot qo'shing, rasmlarini boshqaring", icon: "▣", href: "/catalog/products" },
] as const;

export default function CatalogMenu() {
  return <View style={styles.links}>
    {links.map((link) => <Pressable
      key={link.href}
      style={styles.link}
      onPress={() => router.push(link.href)}
      accessibilityRole="button"
      accessibilityLabel={link.title}
    >
      <Text style={styles.icon}>{link.icon}</Text>
      <View style={styles.body}>
        <Text style={styles.title}>{link.title}</Text>
        <Text style={styles.description}>{link.description}</Text>
      </View>
      <Text style={styles.arrow}>›</Text>
    </Pressable>)}
  </View>;
}

const styles = StyleSheet.create({
  links: { gap: 12, marginBottom: 24 },
  link: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E8EDF3", borderRadius: 18, padding: 18, flexDirection: "row", alignItems: "center", gap: 14 },
  icon: { width: 46, height: 46, textAlign: "center", textAlignVertical: "center", overflow: "hidden", borderRadius: 13, backgroundColor: "#EAF4FF", color: "#1677D2", fontSize: 25, fontWeight: "700" },
  body: { flex: 1 },
  title: { color: "#172536", fontSize: 17, fontWeight: "800" },
  description: { color: "#627184", fontSize: 13, lineHeight: 19, marginTop: 4 },
  arrow: { color: "#1677D2", fontSize: 30, lineHeight: 32 },
});
