import { StyleSheet, View } from "react-native";

const COLORS: Record<string, string> = {
  running: "#22c55e",
  stopped: "#ef4444",
  starting: "#f59e0b",
  error: "#ef4444",
};

export function StatusDot({ status }: { status: string }) {
  return <View style={[styles.dot, { backgroundColor: COLORS[status] ?? "#6b7280" }]} />;
}

const styles = StyleSheet.create({
  dot: { width: 10, height: 10, borderRadius: 5 },
});
