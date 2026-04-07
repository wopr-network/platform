import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { BotInstance } from "../types/bot";
import { StatusDot } from "./StatusDot";

interface Props {
  bot: BotInstance;
  onPress: () => void;
}

export function BotCard({ bot, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.row}>
        <StatusDot status={bot.status} />
        <Text style={styles.name}>{bot.name}</Text>
      </View>
      {bot.lastMessage && (
        <Text style={styles.preview} numberOfLines={1}>
          {bot.lastMessage}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  name: { color: "#fff", fontSize: 18, fontWeight: "600" },
  preview: { color: "#9ca3af", fontSize: 14, marginTop: 6 },
});
