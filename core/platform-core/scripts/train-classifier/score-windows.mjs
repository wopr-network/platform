#!/usr/bin/env node
/**
 * Complexity scorer for conversation windows.
 * Reads conversation-windows.jsonl, scores each window 0.0-1.0, writes dataset-production.jsonl.
 *
 * Scoring philosophy:
 * - Score the TASK complexity, not the message length
 * - A short "yes" after architecture discussion = high score
 * - A long paste + "summarize" = low score
 * - Use MAX of signals, not average (one architecture signal lifts the whole window)
 * - Context from assistant messages reveals what task is actually being worked on
 */

import { readFileSync, writeFileSync } from 'fs';

const INPUT = '/home/tsavo/platform-core/scripts/train-classifier/conversation-windows.jsonl';
const OUTPUT = '/home/tsavo/platform-core/scripts/train-classifier/dataset-production.jsonl';

// ─── Text Cleaning ───────────────────────────────────────────────────

const XML_BLOCK_TAGS = [
  'system-reminder', 'task-notification', 'local-command-caveat',
  'local-command-stdout', 'bash-input', 'bash-stdout', 'bash-stderr',
  'command-name', 'command-message', 'command-args',
  'context_window_protection', 'context_guidance', 'env',
  'priority_instructions', 'tool_selection_hierarchy', 'forbidden_actions',
  'output_constraints', 'artifact_policy', 'response_format', 'ctx_commands',
  'word_limit', 'tip',
  // NOTE: planning_context and instructions are NOT stripped -- they contain real task content
];

function stripXmlTags(text) {
  // Remove full XML blocks with content
  const tagPattern = XML_BLOCK_TAGS.join('|');
  let cleaned = text.replace(new RegExp(`<(${tagPattern})[^>]*>[\\s\\S]*?<\\/\\1>`, 'gi'), '');
  // Remove self-closing and orphan tags
  cleaned = cleaned.replace(/<[^>]+>/g, '');
  return cleaned.trim();
}

function extractUserText(messages) {
  return messages
    .filter(m => m.role === 'user')
    .map(m => stripXmlTags(m.content))
    .filter(t => t.length > 0)
    .join('\n');
}

function extractAssistantText(messages) {
  return messages
    .filter(m => m.role === 'assistant')
    .map(m => stripXmlTags(m.content))
    .filter(t => t.length > 0)
    .join('\n');
}

function extractAllText(messages) {
  return messages
    .map(m => stripXmlTags(m.content))
    .filter(t => t.length > 0)
    .join('\n');
}

// ─── Feature Extraction ─────────────────────────────────────────────

function extractFeatures(messages) {
  const userText = extractUserText(messages);
  const assistantText = extractAssistantText(messages);
  const allText = extractAllText(messages);
  const lc = allText.toLowerCase();
  const userLc = userText.toLowerCase();
  const assistantLc = assistantText.toLowerCase();

  const userMsgs = messages.filter(m => m.role === 'user');
  const assistantMsgs = messages.filter(m => m.role === 'assistant');

  // Last meaningful user message
  let lastUserText = '';
  for (let i = userMsgs.length - 1; i >= 0; i--) {
    const cleaned = stripXmlTags(userMsgs[i].content);
    if (cleaned.length > 2) {
      lastUserText = cleaned;
      break;
    }
  }
  const lastUserLc = lastUserText.toLowerCase();

  // First meaningful user message (sets the topic)
  let firstUserText = '';
  for (const m of userMsgs) {
    const cleaned = stripXmlTags(m.content);
    if (cleaned.length > 10) {
      firstUserText = cleaned;
      break;
    }
  }
  const firstUserLc = firstUserText.toLowerCase();

  // Check for session continuation summaries (these carry context from prior sessions)
  let sessionSummary = '';
  for (const m of messages) {
    if (m.content.includes('continued from a previous conversation')) {
      sessionSummary = stripXmlTags(m.content);
      break;
    }
  }
  const sessionSummaryLc = sessionSummary.toLowerCase();

  // Is the last user message just a short follow-up?
  const isShortFollowUp = lastUserText.length < 40 && messages.length > 2;

  return {
    userText, assistantText, allText,
    lc, userLc, assistantLc,
    lastUserText, lastUserLc,
    firstUserText, firstUserLc,
    sessionSummary, sessionSummaryLc,
    isShortFollowUp,
    userMsgCount: userMsgs.length,
    assistantMsgCount: assistantMsgs.length,
    totalMsgCount: messages.length,
    totalChars: allText.length,
    userChars: userText.length,
  };
}

// ─── Signal Detectors (return 0.0-1.0 each) ────────────────────────

// What is the highest-complexity TOPIC discussed in this window?
function detectTopicComplexity(f) {
  // Search ALL text (user + assistant + session summary) for topic signals
  // Use the full conversation to determine what's being worked on
  const text = f.lc;
  const signals = [];

  // ── 0.85-1.0: Hardest ──
  if (text.match(/distributed.*system|consensus.*protocol|byzantine.*fault|replication.*strateg/))
    signals.push(0.95);
  if (text.match(/full.*architecture.*overhaul|complete.*rewrite|system.*from.*scratch/))
    signals.push(0.9);
  if (text.match(/novel.*algorithm|custom.*protocol|new.*consensus/))
    signals.push(0.9);
  // Multi-system merge/redesign (merging repos, renaming + restructuring entire projects)
  if (text.match(/merge.*radar|rename.*defcon|rename.*silo/) && text.match(/architect|design|restructur|merge/))
    signals.push(0.85);
  // Designing semantic memory / vector search systems
  if (text.match(/vector.*search|semantic.*memory|embedding/) && text.match(/design|implement.*plan|architect/))
    signals.push(0.85);
  // Deep architecture debates about responsibility separation
  if (text.match(/seperat.*responsib|separation.*concern/) && text.match(/state.*machine|dispatch|orchestrat/))
    signals.push(0.85);

  // ── 0.7-0.84: Hard ──
  if (text.match(/architect|system.*design|product.*architect/))
    signals.push(0.75);
  if (text.match(/security.*audit|threat.*model|vulnerability.*assess/))
    signals.push(0.75);
  if (text.match(/multi.*repo.*migrat|migrate.*\d+.*repos|rename.*across.*codebase/))
    signals.push(0.75);
  if (text.match(/productize|product.*strategy|pricing.*model|onboarding.*flow/))
    signals.push(0.72);
  if (text.match(/refactor.*across|codebase.*wide.*refactor|multi.*module.*refactor/))
    signals.push(0.7);
  if (text.match(/design.*pattern|solid.*principle|dependency.*inject/))
    signals.push(0.7);
  if (text.match(/orchestrat.*agent|swarm.*coord|multi.*agent/))
    signals.push(0.72);
  if (text.match(/webhook.*integrat|oauth.*flow|credential.*rotat/))
    signals.push(0.65);
  // Roadmap / phased implementation planning
  if (text.match(/roadmap|phase.*\d.*phase|milestone.*plan/) && text.match(/requirement|success.*criteria/))
    signals.push(0.7);
  // Container orchestration design
  if (text.match(/docker/) && text.match(/dispatch|orchestrat|which.*container/))
    signals.push(0.7);

  // ── 0.5-0.69: Medium-Hard ──
  if (text.match(/create.*plugin|implement.*plugin|build.*plugin|port.*plugin/))
    signals.push(0.6);
  if (text.match(/docker.*compose|dockerfile|container.*setup/))
    signals.push(0.55);
  if (text.match(/ci\/cd|pipeline.*config|github.*action|workflow.*yaml/))
    signals.push(0.55);
  if (text.match(/database.*schema|drizzle.*migrat|schema.*change/))
    signals.push(0.6);
  if (text.match(/api.*endpoint|rest.*api|route.*handler/))
    signals.push(0.5);
  if (text.match(/pr.*review|code.*review|review.*finding|verify.*finding/))
    signals.push(0.55);
  if (text.match(/debug.*complex|investigate.*issue|root.*cause/))
    signals.push(0.55);
  if (text.match(/deploy.*production|production.*deploy|staging.*deploy/))
    signals.push(0.5);
  if (text.match(/test.*coverage|write.*test|integration.*test/))
    signals.push(0.5);
  if (text.match(/rebrand|brand.*change|rename.*project|rename.*repo/))
    signals.push(0.55);
  if (text.match(/github.*runner|self.*hosted.*runner|ci.*runner/))
    signals.push(0.5);

  // ── 0.3-0.49: Moderate ──
  if (text.match(/implement.*function|write.*function|add.*feature/))
    signals.push(0.4);
  if (text.match(/fix.*bug|debug|error.*handling|troubleshoot/))
    signals.push(0.4);
  if (text.match(/git.*merge|git.*rebase|cherry.*pick|merge.*conflict/))
    signals.push(0.4);
  if (text.match(/config.*change|env.*variable|environment.*setup/))
    signals.push(0.35);
  if (text.match(/commit|push|pull.*request|branch/))
    signals.push(0.3);
  if (text.match(/unit.*test|test.*file|spec.*file/))
    signals.push(0.35);
  if (text.match(/format|lint|style.*fix|code.*style/))
    signals.push(0.3);

  // ── 0.1-0.29: Easy ──
  if (text.match(/install|setup|how.*to.*install/))
    signals.push(0.2);
  if (text.match(/explain|what.*is|how.*does|describe|summarize/))
    signals.push(0.2);
  if (text.match(/show.*me|find.*file|search.*for|where.*is|list.*all/))
    signals.push(0.15);
  if (text.match(/free.*space|disk.*cleanup|compact.*vhd|clear.*cache/))
    signals.push(0.15);

  // ── 0.0-0.09: Trivial ──
  if (text.match(/^(hi|hello|hey|thanks|ok|yes|no|sure|got it|good|great)\s*$/))
    signals.push(0.05);

  return signals.length > 0 ? Math.max(...signals) : 0.3;
}

// How complex is the ACTION the user is requesting?
function detectActionComplexity(f) {
  // Focus on user text + first user message for the request
  const text = f.userLc;
  const signals = [];

  // Full system creation
  if (text.match(/create.*system|build.*from.*scratch|implement.*service|develop.*platform/))
    signals.push(0.8);

  // Architecture/design work
  if (text.match(/design|architect|plan.*approach|propose.*solution|spec.*out/))
    signals.push(0.7);

  // Plugin/module creation
  if (text.match(/create.*plugin|create.*module|port.*from|build.*component/))
    signals.push(0.6);

  // Analysis/review
  if (text.match(/analyze.*codebase|review.*code|audit|assess|evaluate|investigate/))
    signals.push(0.55);

  // Multi-step implementation
  if (text.match(/implement|refactor|migrate|rewrite|overhaul/))
    signals.push(0.55);

  // Debugging
  if (text.match(/debug|fix|resolve|troubleshoot|why.*not.*work|broken/))
    signals.push(0.45);

  // Configuration/setup
  if (text.match(/configure|set.*up|wire.*up|connect|hook.*up/))
    signals.push(0.35);

  // Simple modifications
  if (text.match(/update|modify|change|edit|adjust|tweak|rename/))
    signals.push(0.3);

  // Run/execute commands
  if (text.match(/^(run|do it|go ahead|execute|deploy|push|merge|commit)/))
    signals.push(0.25);

  // Information retrieval
  if (text.match(/show|find|search|list|get|check|read|look|explore/))
    signals.push(0.2);

  // Explanation
  if (text.match(/explain|summarize|describe|tell.*about|what.*is/))
    signals.push(0.15);

  // Acknowledgment
  if (text.match(/^(yes|no|ok|sure|thanks|got it|good|great|nice|cool)\b/))
    signals.push(0.05);

  return signals.length > 0 ? Math.max(...signals) : 0.3;
}

// How much SCOPE does the conversation cover?
function detectScope(f) {
  const text = f.lc;
  let scope = 0;

  // Count unique file paths
  const filePaths = text.match(/\/[a-z0-9._-]+\/[a-z0-9._/-]+\.[a-z]+/gi) || [];
  const uniqueFiles = new Set(filePaths.map(p => p.toLowerCase()));
  if (uniqueFiles.size >= 10) scope = Math.max(scope, 0.5);
  else if (uniqueFiles.size >= 5) scope = Math.max(scope, 0.4);
  else if (uniqueFiles.size >= 3) scope = Math.max(scope, 0.3);
  else if (uniqueFiles.size >= 1) scope = Math.max(scope, 0.15);

  // Count repos/projects discussed
  const repoNames = ['wopr', 'holyship', 'defcon', 'silo', 'radar', 'paperclip',
    'nemoclaw', 'platform-core', 'platform-ui', 'cheyenne'];
  const mentionedRepos = new Set();
  for (const r of repoNames) {
    if (text.includes(r)) mentionedRepos.add(r);
  }
  if (mentionedRepos.size >= 4) scope = Math.max(scope, 0.5);
  else if (mentionedRepos.size >= 3) scope = Math.max(scope, 0.4);
  else if (mentionedRepos.size >= 2) scope = Math.max(scope, 0.3);

  // Numbered requirements/steps
  const numberedItems = text.match(/\d+\.\s+\w/g) || [];
  if (numberedItems.length >= 8) scope = Math.max(scope, 0.45);
  else if (numberedItems.length >= 5) scope = Math.max(scope, 0.35);
  else if (numberedItems.length >= 3) scope = Math.max(scope, 0.25);

  // Session continuation carrying context from prior work
  if (f.sessionSummary.length > 200) scope = Math.max(scope, 0.3);

  return scope;
}

// How deep is the conversation (multi-turn reasoning)?
function detectDepth(f) {
  if (f.totalMsgCount <= 1) return 0.0;
  if (f.totalMsgCount <= 2) return 0.05;

  // Count meaningful user turns (not just "yes" / "ok")
  const meaningfulUserLines = f.userText.split('\n').filter(l => l.trim().length > 15);
  const meaningfulAssistantLines = f.assistantText.split('\n').filter(l => l.trim().length > 30);

  // Deep multi-turn design discussion
  if (meaningfulUserLines.length >= 5 && meaningfulAssistantLines.length >= 5) return 0.25;
  if (meaningfulUserLines.length >= 3 && meaningfulAssistantLines.length >= 3) return 0.2;
  if (meaningfulUserLines.length >= 2) return 0.15;
  if (f.totalMsgCount >= 6) return 0.1;

  return 0.05;
}

// What is the assistant ACTUALLY DOING? (reveals true task complexity)
function detectAssistantWork(f) {
  const text = f.assistantLc;
  const signals = [];

  // Architecture/design output
  if (text.match(/architecture|system.*design|component.*diagram|service.*layer/))
    signals.push(0.7);

  // Multi-file implementation
  if (text.match(/created.*files|modified.*files|across.*modules/))
    signals.push(0.6);

  // Security analysis
  if (text.match(/vulnerabilit|security.*issue|attack.*vector|threat/))
    signals.push(0.65);

  // Complex debugging
  if (text.match(/root.*cause|stack.*trace|deadlock|race.*condition|memory.*leak/))
    signals.push(0.6);

  // Schema/migration work
  if (text.match(/migration.*file|schema.*change|alter.*table|create.*table/))
    signals.push(0.55);

  // Docker/deployment
  if (text.match(/docker.*compose|dockerfile|container.*config|deploy/))
    signals.push(0.5);

  // PR review with specific findings
  if (text.match(/finding|review.*comment|code.*quality|suggestion/))
    signals.push(0.5);

  // Pipeline work
  if (text.match(/pipeline|entity.*created|flow.*running|agent.*spawn/))
    signals.push(0.55);

  // Simple code generation
  if (text.match(/function|class|interface/) && !text.match(/architect|design/))
    signals.push(0.35);

  // Explanation/teaching
  if (text.match(/here's.*how|this.*works|the.*reason/))
    signals.push(0.2);

  // Command execution
  if (text.match(/running|executing|installed|completed/))
    signals.push(0.2);

  return signals.length > 0 ? Math.max(...signals) : 0.2;
}

// ─── Main Scoring Function ──────────────────────────────────────────

function scoreWindow(window) {
  const messages = window.messages;
  const f = extractFeatures(messages);

  // ── Handle degenerate cases ──

  // Pure noise: empty content, system commands only
  if (f.userChars < 3 && f.assistantText.length < 30) return 0.05;

  // Model switch / local commands with no real content
  if (f.userChars < 10 && !f.sessionSummary) {
    if (f.assistantText.length > 500) return 0.25;
    return 0.1;
  }

  // Pure interruption with no conversation context
  if (f.lastUserLc === '[request interrupted by user]' && f.totalChars < 200) return 0.05;
  if (f.lastUserLc === '[request interrupted by user for tool use]' && f.totalChars < 200) return 0.05;

  // ── Compute signal scores ──

  const topicScore = detectTopicComplexity(f);
  const actionScore = detectActionComplexity(f);
  const scopeScore = detectScope(f);
  const depthScore = detectDepth(f);
  const assistantWorkScore = detectAssistantWork(f);

  // ── Combine using MAX-weighted approach ──
  // The highest signal is most important (a conversation about architecture
  // should not be dragged down by also mentioning "install")
  // But we also factor in the breadth of signals

  const maxSignal = Math.max(topicScore, actionScore, assistantWorkScore);
  const avgSignal = (topicScore + actionScore + assistantWorkScore) / 3;

  // Base score: 60% max signal, 20% average signal, 10% scope, 10% depth
  let score = maxSignal * 0.55 + avgSignal * 0.15 + scopeScore * 0.15 + depthScore * 0.15;

  // ── Context-aware adjustments ──

  // Short follow-up in a substantive conversation: inherit conversation complexity
  // But discount it -- a "yes" in a complex convo is less complex than the original ask
  if (f.isShortFollowUp && f.totalChars > 1500) {
    const contextScore = maxSignal * 0.5 + avgSignal * 0.15 + scopeScore * 0.1 + depthScore * 0.1;
    // Only boost if the context score is significantly higher (avoids minor inflation)
    if (contextScore > score + 0.1) {
      score = Math.max(score, contextScore * 0.85); // 85% of context complexity
    }
  }

  // Session continuation: parse the summary to determine ongoing task complexity
  // But cap this -- a continuation inherits SOME complexity but not all of it.
  // The user's current-turn content matters more than what was discussed before.
  if (f.sessionSummaryLc.length > 100) {
    const summaryFeatures = {
      ...f,
      lc: f.sessionSummaryLc,
      userLc: f.sessionSummaryLc,
    };
    const summaryTopicScore = detectTopicComplexity(summaryFeatures);

    // If the user is actively driving complex work in THIS window, inherit more
    const userDrivingWork = f.userChars > 100 &&
      f.userLc.match(/implement|design|refactor|architect|create|build|fix|debug|review/);

    if (userDrivingWork) {
      score = Math.max(score, summaryTopicScore * 0.8); // 80% carry-over when actively working
    } else {
      // Just continuing context (short "go" or "yes") -- less inheritance
      score = Math.max(score, summaryTopicScore * 0.65); // 65% carry-over for passive continuation
    }
  }

  // Interrupted request: inherit context if conversation was substantive
  if (f.lastUserLc.includes('[request interrupted')) {
    if (f.totalChars > 2000) {
      // Keep the score from the rest of the conversation
      // (already computed above, just don't penalize)
    } else {
      // Short conversation that got interrupted = low
      score = Math.min(score, 0.25);
    }
  }

  // ── Floor/ceiling adjustments based on hard signals ──

  // Creating something with specs/requirements = at least moderate
  if (f.userLc.match(/requirements|specification|create.*plugin|build.*plugin|implement.*service/) &&
      f.userChars > 100) {
    score = Math.max(score, 0.5);
  }

  // Architecture/design documents being generated
  if (f.lc.match(/architecture\.md|design.*document|roadmap|phase.*\d/)) {
    score = Math.max(score, 0.55);
  }

  // Product strategy / productization discussions
  if (f.lc.match(/productize|standalone.*product|pricing|onboarding|brand.*strategy/)) {
    score = Math.max(score, 0.65);
  }

  // Multi-repo migration
  if (f.lc.match(/migrate.*\d+.*repo|82.*repo|\d+.*repositories/)) {
    score = Math.max(score, 0.7);
  }

  // System architecture redesign (merging/splitting repos, responsibility redesign)
  // Requires substantial ORIGINAL user content (not session summary)
  // Strip session summary from user text for this check
  const userWithoutSummary = f.userLc.replace(/this session is being continued[\s\S]*?(?=\n\n|\n[a-z]|$)/gi, '').trim();
  const realUserChars = userWithoutSummary.length;

  if (userWithoutSummary.match(/rename.*defcon|rename.*silo|merge.*radar|merge.*into/) &&
      userWithoutSummary.match(/architect|design|restructur|responsib/) && realUserChars > 150) {
    score = Math.max(score, 0.85);
  }

  // Deep architecture debate with multi-turn design reasoning
  if (userWithoutSummary.match(/seperat.*responsib|state.*machine|dispatch/) &&
      realUserChars > 400 && f.totalMsgCount >= 6) {
    score = Math.max(score, 0.85);
  }

  // Vector/semantic search system design
  if (userWithoutSummary.match(/vector.*search|semantic.*memory/) &&
      userWithoutSummary.match(/design|implement.*plan|architect/) && realUserChars > 150) {
    score = Math.max(score, 0.85);
  }

  // Comprehensive implementation plan with detailed specs (user wrote the plan)
  if (f.userLc.match(/implementation.*plan|design.*plan/) &&
      f.lc.match(/phase|milestone|requirement/) && f.userChars > 300) {
    score = Math.max(score, 0.75);
  }

  // Multi-turn architecture debate where user is ACTIVELY driving design decisions
  // Requires: user is reasoning about structure, not just monitoring pipeline output
  // Uses userWithoutSummary to avoid session summary inflation
  const userIsDebatingArch = userWithoutSummary.match(/seperat.*responsib|merge.*repo|rename.*to|restructur|what.*we.*want|rethink|rethought|makes.*little.*sense|fundamentally/);
  const userIsDesigning = userWithoutSummary.match(/architect|design|brainstorm|proposal|approach|strategy/);
  if (realUserChars > 600 && f.totalMsgCount >= 4 &&
      (userIsDebatingArch || userIsDesigning) &&
      userWithoutSummary.match(/state.*machine|dispatch|orchestrat|engine|service|endpoint/)) {
    score = Math.max(score, 0.9);
  }

  // Verify/fix PR findings across multiple adapters
  if (f.userLc.match(/verify.*finding|fix.*finding/) &&
      f.userLc.match(/adapter|integrat|module/)) {
    score = Math.max(score, 0.5);
  }

  // Cross-system integration work
  if (f.lc.match(/webhook.*integration|oauth.*integration|mcp.*integration/) &&
      f.lc.match(/adapter|provider|dispatcher/)) {
    score = Math.max(score, 0.6);
  }

  // Simple install that stayed simple
  if (f.firstUserLc.match(/^help.*install|^install/) && f.totalChars < 2000 &&
      !f.lc.match(/architect|design|migrat|refactor/)) {
    score = Math.min(score, 0.25);
  }

  // Disk space / system admin (ceiling)
  if (f.firstUserLc.match(/free.*space|disk.*cleanup/) &&
      !f.lc.match(/architect|design|migrat/)) {
    score = Math.min(score, 0.2);
  }

  // Very short single-turn with no context
  if (f.totalMsgCount === 1 && f.userChars < 60 && !f.sessionSummary) {
    score = Math.min(score, 0.3);
  }

  // Short user text in multi-turn: cap unless conversation has strong architecture signals
  if (f.userChars < 50 && f.totalMsgCount > 2 && !f.sessionSummary) {
    const hasArchSignals = f.lc.match(/architect|system.*design|productize|merge.*repo|vector.*search|seperat.*responsib/);
    if (!hasArchSignals) {
      score = Math.min(score, 0.5);
    }
  }

  // Clamp
  score = Math.max(0.0, Math.min(1.0, score));
  return Math.round(score * 100) / 100;
}

// ─── Main ───────────────────────────────────────────────────────────

const lines = readFileSync(INPUT, 'utf-8').trim().split('\n');
const results = [];
const histogram = {};
for (let i = 0; i <= 9; i++) histogram[i] = [];

for (let i = 0; i < lines.length; i++) {
  const window = JSON.parse(lines[i]);
  const score = scoreWindow(window);
  results.push({ messages: window.messages, score });

  const band = Math.min(Math.floor(score * 10), 9);
  histogram[band].push(i);
}

// Write output
const output = results.map(r => JSON.stringify(r)).join('\n') + '\n';
writeFileSync(OUTPUT, output);

// Report
console.log(`Total labeled: ${results.length}`);
console.log(`Output: ${OUTPUT}`);
console.log(`\nScore distribution:`);

const bandLabels = [
  '0.0-0.09', '0.1-0.19', '0.2-0.29', '0.3-0.39', '0.4-0.49',
  '0.5-0.59', '0.6-0.69', '0.7-0.79', '0.8-0.89', '0.9-1.0'
];

for (let i = 0; i <= 9; i++) {
  const count = histogram[i].length;
  const bar = '#'.repeat(Math.ceil(count / 3));
  console.log(`  ${bandLabels[i].padEnd(10)} ${String(count).padStart(4)} ${bar}`);
}

// Sample 3 windows from each band
console.log('\n\n--- Samples from each band ---');
for (let band = 0; band <= 9; band++) {
  const indices = histogram[band];
  if (indices.length === 0) {
    console.log(`\n[${bandLabels[band]}] (empty)`);
    continue;
  }

  console.log(`\n[${bandLabels[band]}] (${indices.length} windows)`);

  // Pick 3 samples: first, middle, last
  const sampleIdxs = [];
  if (indices.length <= 3) {
    sampleIdxs.push(...indices);
  } else {
    sampleIdxs.push(indices[0]);
    sampleIdxs.push(indices[Math.floor(indices.length / 2)]);
    sampleIdxs.push(indices[indices.length - 1]);
  }

  for (const idx of sampleIdxs) {
    const w = JSON.parse(lines[idx]);
    const f = extractFeatures(w.messages);
    const preview = (f.lastUserText || f.firstUserText || '(no text)').substring(0, 120);
    console.log(`  [${idx}] score=${results[idx].score} "${preview.replace(/\n/g, ' ')}"`);
  }
}

// Score stats
const scores = results.map(r => r.score);
const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
const sorted = [...scores].sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
const p10 = sorted[Math.floor(sorted.length * 0.1)];
const p90 = sorted[Math.floor(sorted.length * 0.9)];
console.log(`\nScore stats: min=${sorted[0]}, max=${sorted[sorted.length-1]}, avg=${avg.toFixed(3)}, median=${median}, p10=${p10}, p90=${p90}`);

// Spot-check specific windows we know about
const spotChecks = [
  { idx: 0, desc: 'install claude code on windows', expected: '0.1-0.25' },
  { idx: 14, desc: 'create Piper TTS plugin', expected: '0.5-0.65' },
  { idx: 65, desc: 'planning_context XML only', expected: '0.3-0.5' },
  { idx: 439, desc: 'upset about GitHub suspension/migration', expected: '0.55-0.7' },
  { idx: 601, desc: 'productize silo discussion', expected: '0.65-0.8' },
  { idx: 401, desc: 'verify findings in GitLab adapter', expected: '0.5-0.6' },
];

console.log('\n\n--- Spot checks ---');
for (const check of spotChecks) {
  if (check.idx < results.length) {
    const actual = results[check.idx].score;
    console.log(`  [${check.idx}] "${check.desc}" → score=${actual} (expected ${check.expected})`);
  }
}
