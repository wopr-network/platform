import { useRouter } from "expo-router";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { BotCard } from "../../src/components/BotCard";
import { useBots } from "../../src/hooks/useBots";

export default function BotListScreen() {
  const { bots, isLoading, error, refresh } = useBots();
  const router = useRouter();

  if (isLoading && bots.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={bots}
      keyExtractor={(b) => b.id}
      renderItem={({ item }) => <BotCard bot={item} onPress={() => router.push(`/chat/${item.id}`)} />}
      onRefresh={refresh}
      refreshing={isLoading}
      ListEmptyComponent={<Text style={styles.empty}>No bots yet. Create one on the web dashboard.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: "#0a0a0a" },
  content: { padding: 16 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0a0a0a",
  },
  error: { color: "#ef4444", fontSize: 16 },
  empty: {
    color: "#6b7280",
    fontSize: 16,
    textAlign: "center",
    marginTop: 48,
  },
});
