"""
Test harness — feed conversations through the trained classifier and see scores.

Loads the ONNX model + MiniLM, embeds text, predicts complexity.
This is what the production gateway will do, but in Python for testing.

Usage: python harness.py
"""

import numpy as np
import onnxruntime as ort
from sentence_transformers import SentenceTransformer

MODEL_PATH = "/tmp/autoencoder-anchored.onnx"
EMBED_MODEL = "all-MiniLM-L6-v2"
WINDOWS_PER_CHANNEL = 12
EMBED_DIM = 384
MAX_CHARS = 30000
CHARS_PER_WINDOW = 1024

# Tier config — matches production
TIERS = [
    (0.2, "deepseek/deepseek-chat-v3-0324", "economy"),
    (1.0, "qwen/qwen3-coder", "standard"),
]


def text_to_windows(text: str) -> list[str]:
    chunks = []
    for i in range(0, len(text), CHARS_PER_WINDOW):
        chunks.append(text[i:i + CHARS_PER_WINDOW])
    if not chunks:
        chunks = ["[EMPTY]"]
    if len(chunks) >= WINDOWS_PER_CHANNEL:
        return chunks[-WINDOWS_PER_CHANNEL:]
    return [""] * (WINDOWS_PER_CHANNEL - len(chunks)) + chunks


def embed_channel(model, text: str) -> np.ndarray:
    truncated = text[-MAX_CHARS:]
    windows = text_to_windows(truncated)
    result = np.zeros(WINDOWS_PER_CHANNEL * EMBED_DIM, dtype=np.float32)
    for i, w in enumerate(windows):
        if w == "":
            continue
        vec = model.encode(w, normalize_embeddings=True)
        result[i * EMBED_DIM:(i + 1) * EMBED_DIM] = vec
    return result


def classify(session, embedding: np.ndarray) -> float:
    # Apply channel weights (user=1.0, assistant=1.2) and L2 normalize
    user_dim = WINDOWS_PER_CHANNEL * EMBED_DIM
    weighted = embedding.copy()
    weighted[user_dim:] *= 1.2  # assistant weight

    # L2 normalize
    norm = np.linalg.norm(weighted)
    if norm > 0:
        weighted /= norm

    inp = weighted.reshape(1, -1).astype(np.float32)
    result = session.run(None, {"embedding": inp})
    return float(result[0][0])


def route(score: float) -> tuple[str, str]:
    for threshold, model, label in TIERS:
        if score <= threshold:
            return model, label
    return TIERS[-1][1], TIERS[-1][2]


def score_conversation(embed_model, onnx_session, user_text: str, assistant_text: str = "[EMPTY]") -> dict:
    user_emb = embed_channel(embed_model, user_text)
    asst_emb = embed_channel(embed_model, assistant_text)
    combined = np.concatenate([user_emb, asst_emb])
    score = classify(onnx_session, combined)
    model, tier = route(score)
    return {"score": score, "tier": tier, "model": model}


# ============================================================
# TEST CONVERSATIONS
# ============================================================
TESTS = [
    {
        "name": "Simple greeting",
        "user": "Hello!",
        "assistant": "[EMPTY]",
    },
    {
        "name": "Quick question",
        "user": "What time is it?",
        "assistant": "[EMPTY]",
    },
    {
        "name": "Fix a typo",
        "user": "Fix the typo on line 5 of main.ts",
        "assistant": "I'll fix that typo for you.",
    },
    {
        "name": "Simple bug fix",
        "user": "The login button doesn't work. It throws a null pointer on click.",
        "assistant": "I see the issue — the onClick handler references this.state.user but state isn't initialized. Let me add the default state.",
    },
    {
        "name": "Add a feature",
        "user": "Add a dark mode toggle to the settings page. It should persist the preference in localStorage and apply the theme immediately without a page reload.",
        "assistant": "I'll need to modify the SettingsPage component, create a ThemeProvider context, and add CSS variables for both themes. Let me start with the ThemeProvider.",
    },
    {
        "name": "Complex refactor",
        "user": "Refactor the entire authentication system to support SAML, OAuth2, and LDAP across all our microservices. We need a unified auth gateway that handles token exchange, session management, and role-based access control. The current system is spread across 12 services with inconsistent implementations.",
        "assistant": "This is a significant architectural change. Let me start by mapping the current auth implementations across all 12 services, then design the unified gateway. We'll need to handle backwards compatibility during migration. I'll create a detailed plan covering the auth gateway service, token exchange protocol, session store migration, RBAC policy engine, and per-service migration path.",
    },
    {
        "name": "Multi-turn complex debugging",
        "user": "We're seeing intermittent 502s in production. The load balancer health checks pass but real traffic gets connection resets. It only happens during peak hours (2-5pm EST) and the error rate correlates with database connection pool exhaustion. We've already tried increasing the pool size from 20 to 50 but it made things worse. The app is Node.js with PostgreSQL on Kubernetes with 8 replicas. Here are the relevant logs from the last incident: [500 lines of logs]. We also noticed the pgbouncer metrics show transaction pooling mode is causing long-running queries to hold connections. The team tried switching to session pooling but that caused a different issue with prepared statements.",
        "assistant": "This is a classic connection pool starvation pattern exacerbated by transaction pooling semantics. Let me trace through the full stack: The 502s happen because Node's HTTP server closes the socket when it can't acquire a DB connection within the timeout. With pgbouncer in transaction mode, prepared statements get associated with server-side connections that rotate, causing 'prepared statement does not exist' errors. The real fix needs three parts: 1) Configure pgbouncer with max_client_conn properly relative to your K8s replica count, 2) Switch to protocol-level connection pooling in the Node driver instead of application-level, 3) Add circuit breakers around DB calls so the HTTP server can return 503 with retry-after instead of hanging until timeout.",
    },
    {
        "name": "Yes (confirming a complex plan)",
        "user": "yes",
        "assistant": "Great, I'll proceed with the full authentication system redesign. Starting with the unified gateway service, creating the token exchange protocol, and setting up the RBAC policy engine. This will be a multi-phase migration across all 12 microservices.",
    },
    {
        "name": "Config change",
        "user": "Change the port from 3000 to 8080 in the config",
        "assistant": "Done. Updated PORT in .env from 3000 to 8080.",
    },
    {
        "name": "Performance optimization",
        "user": "Our API response times went from 50ms to 2 seconds after the last deploy. Profile shows 80% of time is spent in the serialization layer. We're using JSON.stringify on deeply nested objects with circular references that we're breaking with a custom replacer function. The objects are ORM entities with lazy-loaded relations that trigger N+1 queries during serialization.",
        "assistant": "The serialization bottleneck is caused by lazy-loading triggering during JSON.stringify traversal. Each property access fires a SQL query. With nested entities 5 levels deep across 100 items, you're looking at potentially thousands of queries per request. The fix is to eager-load the exact shape you need with a projection query, then serialize a plain DTO instead of the ORM entity. I'll also add a serialization boundary that strips circular refs before they reach the replacer.",
    },
]


def main():
    print("Loading MiniLM embedder...")
    embed_model = SentenceTransformer(EMBED_MODEL, device="cpu")

    print("Loading ONNX classifier...")
    session = ort.InferenceSession(MODEL_PATH)

    print(f"\nModel: {MODEL_PATH}")
    print(f"Tiers: {TIERS}")
    print(f"{'─' * 80}")

    for test in TESTS:
        result = score_conversation(embed_model, session, test["user"], test["assistant"])
        score = result["score"]
        tier = result["tier"]
        model = result["model"].split("/")[-1]

        # Visual bar
        bar_len = 40
        filled = int(score * bar_len)
        bar = "█" * filled + "░" * (bar_len - filled)
        cutoff = int(0.2 * bar_len)
        marker = " " * cutoff + "│"

        print(f"\n  {test['name']}")
        print(f"  Score: {score:.4f}  [{bar}] → {tier.upper()} ({model})")
        print(f"  {' ' * 10}{marker} 0.2 cutoff")

    print(f"\n{'─' * 80}")
    print("Done.")


if __name__ == "__main__":
    main()
