import { Redirect } from "expo-router";

// Older app sessions may still point to the former combined catalog page.
export default function LegacyCategoriesPage() {
  return <Redirect href="/catalog/groups" />;
}
