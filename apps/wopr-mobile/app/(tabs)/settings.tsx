import { useRouter } from "expo-router";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../../src/hooks/useAuth";

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.replace("/(auth)/login");
  };

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.label}>Account</Text>
        <Text style={styles.value}>{user?.email ?? "Not signed in"}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Notifications</Text>
        <Text style={styles.hint}>Push notification preferences coming soon.</Text>
      </View>

      <TouchableOpacity
        style={styles.signOutButton}
        onPress={() =>
          Alert.alert("Sign Out", "Are you sure?", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Sign Out",
              style: "destructive",
              onPress: handleSignOut,
            },
          ])
        }
      >
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a", padding: 24 },
  section: { marginBottom: 32 },
  label: {
    color: "#9ca3af",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  value: { color: "#fff", fontSize: 18 },
  hint: { color: "#6b7280", fontSize: 14 },
  signOutButton: {
    marginTop: "auto",
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },
  signOutText: { color: "#ef4444", fontSize: 16, fontWeight: "600" },
});
