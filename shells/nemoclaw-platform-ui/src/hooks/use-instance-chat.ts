"use client";

import type { ChatMessage } from "@core/lib/chat/types";
import { useCallback, useEffect, useRef, useState } from "react";

function uuid(): string {
	return crypto.randomUUID();
}

interface ChatEvent {
	type: "text" | "done" | "error" | "tool_call" | "connected";
	delta?: string;
	message?: string;
	sessionId?: string;
	tool?: string;
	args?: Record<string, unknown>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export function useInstanceChat(instanceId: string | null) {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [isConnected, setIsConnected] = useState(false);
	const [isTyping, setIsTyping] = useState(false);
	const sessionIdRef = useRef<string>(uuid());
	const eventSourceRef = useRef<{ close(): void } | null>(null);
	const pendingBotMsgRef = useRef<string | null>(null);
	const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const reconnectDelayRef = useRef(1000);
	const instanceIdRef = useRef(instanceId);

	useEffect(() => {
		instanceIdRef.current = instanceId;
	}, [instanceId]);

	const addMessage = useCallback((msg: ChatMessage) => {
		setMessages((prev) => [...prev, msg]);
	}, []);

	const loadHistory = useCallback(async (instId: string) => {
		try {
			const res = await fetch(
				`${API_BASE}/api/chat/history?instanceId=${instId}`,
				{ credentials: "include" },
			);
			if (!res.ok) return;
			const json = (await res.json()) as {
				messages?: Array<{ role: string; content: string }>;
			};
			if (!json.messages?.length) return;
			const restored: ChatMessage[] = json.messages.map((m) => ({
				id: uuid(),
				role: m.role === "user" ? ("user" as const) : ("bot" as const),
				content: m.content,
				timestamp: Date.now(),
			}));
			setMessages(restored);
		} catch {
			// history load failed — start fresh
		}
	}, []);

	const connectSSE = useCallback(() => {
		if (typeof window === "undefined" || !instanceIdRef.current) return;

		eventSourceRef.current?.close();

		const abortController = new AbortController();
		eventSourceRef.current = { close: () => abortController.abort() };

		fetch(`${API_BASE}/api/chat/stream`, {
			headers: {
				"X-Session-ID": sessionIdRef.current,
			},
			credentials: "include",
			signal: abortController.signal,
		})
			.then(async (res) => {
				if (!res.ok || !res.body) throw new Error("SSE connection failed");
				setIsConnected(true);
				reconnectDelayRef.current = 1000;

				const reader = res.body.getReader();
				const decoder = new TextDecoder();
				let buffer = "";

				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n");
					buffer = lines.pop() ?? "";

					for (const line of lines) {
						if (!line.startsWith("data:")) continue;
						const raw = line.slice(5).trim();
						if (!raw) continue;
						try {
							const data = JSON.parse(raw) as ChatEvent;
							if (data.type === "text" && data.delta) {
								setIsTyping(true);
								if (!pendingBotMsgRef.current)
									pendingBotMsgRef.current = uuid();
								const msgId = pendingBotMsgRef.current;
								setMessages((prev) => {
									const existing = prev.find((m) => m.id === msgId);
									if (existing) {
										return prev.map((m) =>
											m.id === msgId
												? {
														...m,
														content: m.content + (data.delta ?? ""),
													}
												: m,
										);
									}
									return [
										...prev,
										{
											id: msgId,
											role: "bot" as const,
											content: data.delta ?? "",
											timestamp: Date.now(),
										},
									];
								});
							} else if (data.type === "done") {
								setIsTyping(false);
								pendingBotMsgRef.current = null;
							} else if (data.type === "error") {
								setIsTyping(false);
								pendingBotMsgRef.current = null;
								addMessage({
									id: uuid(),
									role: "bot",
									content: `Error: ${data.message ?? "Unknown error"}`,
									timestamp: Date.now(),
								});
							}
						} catch {
							/* ignore malformed SSE data */
						}
					}
				}
			})
			.catch((err: unknown) => {
				if (err instanceof Error && err.name === "AbortError") return;
				setIsConnected(false);
				eventSourceRef.current = null;
				const delay = reconnectDelayRef.current;
				reconnectDelayRef.current = Math.min(delay * 2, 10000);
				reconnectTimeoutRef.current = setTimeout(connectSSE, delay);
			});
	}, [addMessage]);

	// Connect on mount, load history + reconnect on instanceId change
	useEffect(() => {
		if (!instanceId) return;
		setIsTyping(false);
		setIsConnected(false);
		pendingBotMsgRef.current = null;
		sessionIdRef.current = uuid();

		// Load persisted history from DB, then connect SSE
		loadHistory(instanceId);
		connectSSE();

		return () => {
			eventSourceRef.current?.close();
			if (reconnectTimeoutRef.current)
				clearTimeout(reconnectTimeoutRef.current);
		};
	}, [instanceId, connectSSE, loadHistory]);

	const sendMessage = useCallback(
		(text: string) => {
			const trimmed = text.trim();
			if (!trimmed || !instanceIdRef.current) return;

			addMessage({
				id: uuid(),
				role: "user",
				content: trimmed,
				timestamp: Date.now(),
			});
			setIsTyping(true);

			fetch(`${API_BASE}/api/chat`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					sessionId: sessionIdRef.current,
					message: trimmed,
					instanceId: instanceIdRef.current,
				}),
			}).catch(() => {
				setIsTyping(false);
				addMessage({
					id: uuid(),
					role: "bot",
					content: "Sorry, your message could not be sent.",
					timestamp: Date.now(),
				});
			});
		},
		[addMessage],
	);

	const clearHistory = useCallback(() => {
		setMessages([]);
		setIsTyping(false);
		pendingBotMsgRef.current = null;
	}, []);

	return {
		messages,
		isConnected,
		isTyping,
		sessionId: sessionIdRef.current,
		sendMessage,
		clearHistory,
	};
}
