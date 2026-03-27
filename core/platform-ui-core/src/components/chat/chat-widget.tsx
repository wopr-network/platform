"use client";

import { AnimatePresence } from "framer-motion";
import { useChatContext } from "@/lib/chat/chat-context";
import { AmbientDot } from "./ambient-dot";
import { ChatPanel } from "./chat-panel";

export function ChatWidget() {
  const {
    messages,
    mode,
    isConnected,
    isTyping,
    hasUnread,
    expand,
    collapse,
    fullscreen,
    sendMessage,
  } = useChatContext();

  return (
    <>
      <AnimatePresence>
        {mode === "collapsed" && <AmbientDot hasUnread={hasUnread} onClick={expand} />}
      </AnimatePresence>
      <AnimatePresence>
        {(mode === "expanded" || mode === "fullscreen") && (
          <ChatPanel
            messages={messages}
            mode={mode}
            isConnected={isConnected}
            isTyping={isTyping}
            onSend={sendMessage}
            onClose={collapse}
            onFullscreen={fullscreen}
          />
        )}
      </AnimatePresence>
    </>
  );
}
