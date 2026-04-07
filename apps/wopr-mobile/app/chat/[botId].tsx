import { useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { GiftedChat, type IMessage } from "react-native-gifted-chat";
import { useSSEChat } from "../../src/hooks/useSSEChat";

export default function ChatScreen() {
  const { botId } = useLocalSearchParams<{ botId: string }>();
  const sessionId = botId ?? "unknown";
  const { messages, sendMessage, isTyping } = useSSEChat(sessionId);

  const onSend = useCallback(
    (newMessages: IMessage[] = []) => {
      const text = newMessages[0]?.text;
      if (text) sendMessage(text);
    },
    [sendMessage],
  );

  // Map our ChatMessage to GiftedChat IMessage format
  const giftedMessages: IMessage[] = messages.map((m) => ({
    _id: m._id,
    text: m.text,
    createdAt: m.createdAt,
    user: { _id: m.user._id, name: m.user.name },
  }));

  return (
    <View style={styles.container}>
      <GiftedChat
        messages={giftedMessages}
        onSend={onSend}
        user={{ _id: "me", name: "You" }}
        isTyping={isTyping}
        renderUsernameOnMessage
        alwaysShowSend
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
});
