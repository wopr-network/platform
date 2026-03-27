import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

// ── Types ──────────────────────────────────────────────────────────────────

interface ContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}

interface Message {
  role?: string;
  content?: string | ContentBlock[];
}

interface SessionLine {
  type?: string;
  message?: Message;
  userType?: string;
}

interface SimplifiedMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface TrainingSample {
  messages: SimplifiedMessage[];
  window_size: number;
  total_chars: number;
  source: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const PROJECTS_DIR = path.join(
  process.env.HOME || "/home/tsavo",
  ".claude/projects"
);
const OUTPUT_FILE = path.join(
  "/home/tsavo/platform-core/scripts/train-classifier",
  "conversation-windows.jsonl"
);
const MAX_CONTENT_CHARS = 2000;
const MAX_WINDOW_MESSAGES = 10;
const MIN_WINDOW_CHARS = 50;
const MIN_REAL_USER_CHARS = 20;
const PROGRESS_INTERVAL = 1000;

// ── Helpers ────────────────────────────────────────────────────────────────

function extractText(content: string | ContentBlock[] | undefined): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text!)
    .join("\n");
}

function isToolResultOnly(content: string | ContentBlock[] | undefined): boolean {
  if (!content || typeof content === "string") return false;
  if (!Array.isArray(content)) return false;
  // If every block is a tool_result (no text blocks at all), it's tool-result-only
  return content.length > 0 && content.every((b) => b.type === "tool_result");
}

function stripSystemTags(text: string): string {
  // Remove <system-reminder>...</system-reminder> and <task-notification>...</task-notification>
  let cleaned = text.replace(
    /<system-reminder>[\s\S]*?<\/system-reminder>/g,
    ""
  );
  cleaned = cleaned.replace(
    /<task-notification>[\s\S]*?<\/task-notification>/g,
    ""
  );
  return cleaned.trim();
}

function isRealUserContent(text: string): boolean {
  const stripped = stripSystemTags(text);
  return stripped.length > MIN_REAL_USER_CHARS;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max);
}

// ── File discovery ─────────────────────────────────────────────────────────

function findJsonlFiles(dir: string): string[] {
  const results: string[] = [];
  const stack: string[] = [dir];

  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue; // permission errors, etc.
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        results.push(full);
      }
    }
  }

  return results;
}

// ── Process a single session file ──────────────────────────────────────────

async function processSessionFile(
  filePath: string,
  outputStream: fs.WriteStream,
  relativeTo: string
): Promise<{ windows: number; windowSizes: number[] }> {
  const conversation: SimplifiedMessage[] = [];
  let windowCount = 0;
  const windowSizes: number[] = [];

  const fileStream = fs.createReadStream(filePath, { encoding: "utf-8" });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const source = path.relative(relativeTo, filePath);

  for await (const line of rl) {
    if (!line.trim()) continue;

    let obj: SessionLine;
    try {
      obj = JSON.parse(line);
    } catch {
      continue; // malformed JSON
    }

    const type = obj.type;
    if (type !== "user" && type !== "assistant") continue;
    if (!obj.message) continue;

    const content = obj.message.content;

    // Skip tool_result-only "user" messages (automatic, not real user input)
    if (type === "user" && isToolResultOnly(content)) continue;

    const text = extractText(content);
    if (!text) continue;

    const truncatedText = truncate(text, MAX_CONTENT_CHARS);

    // Determine role: first user message with system-reminder could be "system"
    let role: "system" | "user" | "assistant";
    if (type === "user") {
      // Check if this is essentially a system message (only system-reminder content)
      if (
        conversation.length === 0 &&
        text.includes("<system-reminder>") &&
        !isRealUserContent(text)
      ) {
        role = "system";
      } else {
        role = "user";
      }
    } else {
      role = "assistant";
    }

    conversation.push({ role, content: truncatedText });

    // Only create a window when we encounter a real user message
    if (role === "user" && isRealUserContent(text)) {
      // Build window: last MAX_WINDOW_MESSAGES messages up to and including this one
      const windowStart = Math.max(0, conversation.length - MAX_WINDOW_MESSAGES);
      const window = conversation.slice(windowStart);

      const totalChars = window.reduce((sum, m) => sum + m.content.length, 0);
      if (totalChars < MIN_WINDOW_CHARS) continue;

      const sample: TrainingSample = {
        messages: window,
        window_size: window.length,
        total_chars: totalChars,
        source,
      };

      outputStream.write(JSON.stringify(sample) + "\n");
      windowCount++;
      windowSizes.push(window.length);
    }
  }

  return { windows: windowCount, windowSizes };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Discovering JSONL files under ${PROJECTS_DIR}...`);
  const files = findJsonlFiles(PROJECTS_DIR);
  console.log(`Found ${files.length} JSONL files`);

  // Ensure output directory exists
  const outputDir = path.dirname(OUTPUT_FILE);
  fs.mkdirSync(outputDir, { recursive: true });

  const outputStream = fs.createWriteStream(OUTPUT_FILE, { encoding: "utf-8" });

  let totalFiles = 0;
  let totalWindows = 0;
  const allWindowSizes: number[] = [];
  let filesWithWindows = 0;
  const startTime = Date.now();

  for (const file of files) {
    try {
      const { windows, windowSizes } = await processSessionFile(
        file,
        outputStream,
        PROJECTS_DIR
      );
      totalWindows += windows;
      allWindowSizes.push(...windowSizes);
      if (windows > 0) filesWithWindows++;
    } catch (err) {
      // Skip files that cause errors (corrupted, etc.)
    }

    totalFiles++;
    if (totalFiles % PROGRESS_INTERVAL === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `  Processed ${totalFiles}/${files.length} files | ${totalWindows} windows | ${elapsed}s`
      );
    }
  }

  // Wait for output stream to finish
  await new Promise<void>((resolve, reject) => {
    outputStream.end(() => resolve());
    outputStream.on("error", reject);
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // ── Stats ──────────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════");
  console.log("  MINING COMPLETE");
  console.log("════════════════════════════════════════════════════════");
  console.log(`  Files processed:     ${totalFiles}`);
  console.log(`  Files with windows:  ${filesWithWindows}`);
  console.log(`  Total windows:       ${totalWindows}`);
  console.log(`  Time:                ${elapsed}s`);

  if (allWindowSizes.length > 0) {
    const avg = (
      allWindowSizes.reduce((a, b) => a + b, 0) / allWindowSizes.length
    ).toFixed(2);
    const min = Math.min(...allWindowSizes);
    const max = Math.max(...allWindowSizes);

    // Distribution
    const dist: Record<number, number> = {};
    for (const s of allWindowSizes) {
      dist[s] = (dist[s] || 0) + 1;
    }

    console.log(`\n  Window size stats:`);
    console.log(`    Average: ${avg}`);
    console.log(`    Min:     ${min}`);
    console.log(`    Max:     ${max}`);
    console.log(`\n  Window size distribution:`);
    for (const size of Object.keys(dist).map(Number).sort((a, b) => a - b)) {
      const count = dist[size];
      const pct = ((count / allWindowSizes.length) * 100).toFixed(1);
      const bar = "#".repeat(Math.min(50, Math.round(count / allWindowSizes.length * 50)));
      console.log(`    size=${String(size).padStart(2)}: ${String(count).padStart(6)} (${pct.padStart(5)}%) ${bar}`);
    }
  }

  console.log(`\n  Output: ${OUTPUT_FILE}`);

  // ── Sample windows ───────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════");
  console.log("  SAMPLE WINDOWS");
  console.log("════════════════════════════════════════════════════════");

  // Read back a few samples from output
  const sampleStream = fs.createReadStream(OUTPUT_FILE, { encoding: "utf-8" });
  const sampleRl = readline.createInterface({
    input: sampleStream,
    crlfDelay: Infinity,
  });

  const samples: TrainingSample[] = [];
  let lineNum = 0;
  for await (const line of sampleRl) {
    if (!line.trim()) continue;
    lineNum++;
    try {
      const sample = JSON.parse(line) as TrainingSample;
      // Collect first few, a middle one, and try to get varying sizes
      if (lineNum <= 3 || lineNum === Math.floor(totalWindows / 2) || lineNum === totalWindows) {
        samples.push(sample);
      }
    } catch {
      continue;
    }
    // Collect a few small, medium, large by window_size
    if (samples.length < 3) continue;
  }

  // Show up to 5 samples
  for (let i = 0; i < Math.min(5, samples.length); i++) {
    const s = samples[i];
    console.log(`\n  --- Sample ${i + 1} (window_size=${s.window_size}, total_chars=${s.total_chars}, source=${s.source}) ---`);
    for (const msg of s.messages) {
      const preview = msg.content.slice(0, 120).replace(/\n/g, "\\n");
      console.log(`    [${msg.role}] ${preview}${msg.content.length > 120 ? "..." : ""}`);
    }
  }

  console.log("\n════════════════════════════════════════════════════════");
  console.log("  DONE");
  console.log("════════════════════════════════════════════════════════");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
