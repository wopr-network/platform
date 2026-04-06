/**
 * HotPool — manages a pool of pre-warmed Docker containers for instant claiming.
 *
 * The pool is container-aware but product-agnostic. Callers register container
 * specs (image, port, network) under opaque keys. The pool keeps warm containers
 * for each registered spec and lets callers claim them atomically.
 *
 * Registration is dynamic — add a new product to the DB, register it with
 * the pool, and warm containers appear on the next tick.
 *
 * All pool state (instances, sizes) is persisted via IPoolRepository.
 */

import crypto from "node:crypto";
import { logger } from "../../config/logger.js";
import type { IPoolRepository } from "./pool-repository.js";

// ---------------------------------------------------------------------------
// Friendly names — deterministic adjective-noun from UUID, Docker-style
// ---------------------------------------------------------------------------

const ADJECTIVES = [
  // personality disorders
  "unhinged",
  "feral",
  "cursed",
  "sus",
  "sketchy",
  "petty",
  "salty",
  "crusty",
  "janky",
  "hangry",
  "dramatic",
  "shady",
  "savage",
  "unruly",
  "snarky",
  "smug",
  "bonkers",
  "cheeky",
  "rowdy",
  "reckless",
  "absurd",
  "bratty",
  "chaotic",
  "delulu",
  "unmedicated",
  "malding",
  "tilted",
  "triggered",
  "woke",
  "based",
  // substance-adjacent
  "overcaffeinated",
  "sleep-deprived",
  "decaffeinated",
  "microdosed",
  "fermented",
  "pickled",
  "marinated",
  "deep-fried",
  "half-baked",
  "toasted",
  // workplace energy
  "passive-aggressive",
  "overcommitted",
  "underperforming",
  "quietly-panicking",
  "aggressively-mediocre",
  "suspiciously-competent",
  "emotionally-unavailable",
  "terminally-online",
  "existentially-confused",
  "performatively-busy",
  "strategically-incompetent",
  "willfully-ignorant",
  "aggressively-optimistic",
  "chronically-understaffed",
  "legally-distinct",
  "barely-functional",
  "professionally-unserious",
  "structurally-unsound",
  "fundamentally-flawed",
  "optimistically-doomed",
  "enthusiastically-incompetent",
  "serenely-panicking",
  // vibes
  "chronically-unwell",
  "violently-chill",
  "dangerously-bored",
  "mildly-illegal",
  "technically-correct",
  "profoundly-unbothered",
  "cosmically-irrelevant",
  "precariously-balanced",
  "hilariously-broken",
  "comically-overengineered",
  "suspiciously-cheerful",
  "worryingly-confident",
  "disturbingly-calm",
  "alarmingly-casual",
  "stubbornly-wrong",
  "confidently-incorrect",
  "gloriously-chaotic",
  "magnificently-stupid",
  "beautifully-cursed",
  "catastrophically-optimistic",
  "heroically-misguided",
  "spectacularly-mid",
  "relentlessly-mediocre",
  "impressively-wrong",
  "unapologetically-janky",
  "genuinely-unhinged",
  "quietly-feral",
  "loudly-confused",
  "deeply-suspicious",
  "vaguely-menacing",
  "ominously-cheerful",
  "deceptively-simple",
  "unnecessarily-complicated",
  "inexplicably-sticky",
  "perpetually-loading",
  "temporarily-permanent",
  "accidentally-sentient",
  "reluctantly-alive",
  // corpo speak gone wrong
  "synergy-poisoned",
  "agile-certified",
  "blockchain-enabled",
  "ai-powered",
  "cloud-native",
  "disruption-ready",
  "pivot-happy",
  "growth-hacked",
  "venture-backed",
  "series-a-burned",
  "runway-zero",
  "ipo-delusional",
  "lean-startupped",
  "mvp-shipped",
  "tech-debted",
  "sprint-zero",
  // existential
  "entropy-aware",
  "heat-death-adjacent",
  "void-staring",
  "abyss-gazing",
  "nihilism-flavored",
  "absurdism-pilled",
  "kafka-esque",
  "sisyphean",
  "ouroboros-shaped",
  "mobius-stripped",
  "paradox-tolerant",
  "schrodinger-boxed",
  // internet brain
  "ratio'd",
  "main-character",
  "npc-coded",
  "side-quest",
  "speedrun",
  "no-clip",
  "glitched",
  "pixel-perfect",
  "lag-compensated",
  "desync'd",
  "rubber-banding",
  "frame-perfect",
  "rng-blessed",
  "rng-cursed",
  // medical chart
  "clinically-unhinged",
  "diagnosably-chaotic",
  "therapeutically-resistant",
  "self-medicated",
  "treatment-non-compliant",
  "symptomatically-concerning",
  "acutely-deranged",
  "chronically-online",
  "terminally-chill",
  // food safety violations
  "room-temperature",
  "expired",
  "off-brand",
  "store-brand",
  "gas-station",
  "vending-machine",
  "microwave-safe",
  "freezer-burned",
  "mystery-meat",
  "bottom-shelf",
  "clearance-rack",
  "as-is",
  "no-returns",
  "scratch-and-dent",
  // real estate listing energy
  "move-in-ready",
  "charming",
  "cozy",
  "rustic",
  "up-and-coming",
  "needs-work",
  "handyman-special",
  "as-is-where-is",
  "cash-only",
  "investor-special",
  "motivated-seller",
  "priced-to-sell",
  // dating profile energy
  "emotionally-available-ish",
  "gym-adjacent",
  "dog-adjacent",
  "situationship-ready",
  "red-flag-coded",
  "green-flag-if-you-squint",
  "breadcrumbing",
  "benching",
  "haunting",
  "zombieing",
  "orbiting",
  // threat levels
  "defcon-five",
  "defcon-one",
  "amber-alert",
  "tornado-watch",
  "tsunami-warning",
  "solar-flare",
  "extinction-level",
  "containment-breach",
  "biohazard",
  "radioactive",
  "weapons-grade",
  "industrial-strength",
  // bureaucracy
  "permit-pending",
  "under-review",
  "pending-approval",
  "tps-reporting",
  "compliance-optional",
  "audit-proof",
  "regulation-adjacent",
  "loophole-exploiting",
  "fine-print",
  "terms-of-service",
  // bodily functions
  "rainbow-shitting",
  "glitter-puking",
  "sweat-stained",
  "snot-rockets",
  "ugly-crying",
  "dry-heaving",
  "stress-sweating",
  "nervous-farting",
  // conspiracy-adjacent
  "epstein-files",
  "area-51",
  "grassy-knoll",
  "false-flag",
  "deep-state",
  "shadow-government",
  "lizard-people",
  "flat-earth",
  "birds-arent-real",
  "simulation-confirmed",
  "redpilled",
  "bluepilled",
  "tinfoil-hatted",
  // politically unhinged
  "trump-hating",
  "filibuster-proof",
  "gerrymandered",
  "lobbied",
  "pork-barreled",
  "dark-money",
  "super-pac'd",
  "congressional-hearing",
  "executive-ordered",
  "impeachment-ready",
  // unhinged energy
  "fridge-raiding",
  "pants-optional",
  "unshowered",
  "three-day-bender",
  "floor-sleeping",
  "dumpster-diving",
  "couch-surfing",
  "gas-huffing",
  "tide-pod-eating",
  "bath-salts",
  "florida-man",
  "walmart-energy",
  "meth-adjacent",
  "crack-adjacent",
  // gen-z therapy speak
  "ick-giving",
  "beige-flag",
  "no-thoughts",
  "brain-rot",
  "chronically-cooked",
  "actually-unwell",
  "literally-deceased",
  "lowkey-feral",
  "highkey-deranged",
  "rent-free",
] as const;

const VERBS = [
  // dev ops
  "yelling-at",
  "blaming",
  "ghosting",
  "debugging",
  "deploying",
  "breaking",
  "fixing",
  "ignoring",
  "fighting",
  "judging",
  "questioning",
  "rebooting",
  "refactoring",
  "reverting",
  "bikeshedding",
  "yak-shaving",
  "rubber-ducking",
  "cargo-culting",
  "stack-overflowing",
  "copy-pasting",
  "force-pushing",
  "rage-committing",
  "cherry-picking",
  "rebasing",
  "tab-hoarding",
  "procrastinating",
  "overthinking",
  "underestimating",
  "shipping",
  "hotfixing",
  "monkey-patching",
  "duct-taping",
  "nerd-sniping",
  "speed-running",
  "stress-testing",
  "load-bearing",
  "hand-waving",
  // social warfare
  "gaslighting",
  "mansplaining",
  "gatekeeping",
  "subtweeting",
  "vaguebooking",
  "hate-watching",
  "doom-scrolling",
  "ratio-ing",
  "dunking-on",
  "clapping-back",
  "main-charactering",
  "touch-grassing",
  "sealioning",
  "concern-trolling",
  "tone-policing",
  "well-actuallying",
  "reply-guying",
  "hot-taking",
  // git crimes
  "panic-merging",
  "blame-shifting",
  "scope-creeping",
  "spite-committing",
  "rage-refactoring",
  "revenge-deploying",
  "hate-merging",
  "doom-coding",
  "grief-coding",
  "stress-eating",
  "force-pushing-to-main",
  "deleting-node-modules",
  "mass-renaming",
  "squash-and-praying",
  // corporate sabotage
  "feature-flagging",
  "dark-launching",
  "shadow-deploying",
  "canary-killing",
  "dog-fooding",
  "rubber-stamping",
  "premature-optimizing",
  "over-abstracting",
  "under-documenting",
  "silently-failing",
  "loudly-succeeding",
  "aggressively-caching",
  "accidentally-ddosing",
  "casually-dropping",
  "frantically-googling",
  "desperately-stackoverflowing",
  "passive-aggressively-reviewing",
  "dramatically-exiting",
  "quietly-sabotaging",
  "enthusiastically-breaking",
  "methodically-destroying",
  "lovingly-deprecating",
  "gently-nuking",
  "ceremonially-deleting",
  "ritually-purging",
  "gleefully-reverting",
  "reluctantly-approving",
  "begrudgingly-merging",
  "triumphantly-closing",
  "victoriously-wontfixing",
  "shamelessly-yoloing",
  "heroically-rollbacking",
  // meetings
  "muting",
  "unmuting",
  "screen-sharing",
  "breakout-rooming",
  "standup-skipping",
  "retro-dreading",
  "sprint-planning",
  "backlog-grooming",
  "pointing-at",
  "time-boxing",
  "parking-lotting",
  "action-iteming",
  "following-up-on",
  "circling-back-to",
  "syncing-on",
  "aligning-with",
  "looping-in",
  "taking-offline",
  "pinging",
  "nudging",
  "bumping",
  "double-clicking-on",
  // emotional labor
  "trauma-dumping-on",
  "oversharing-with",
  "boundaries-violating",
  "love-bombing",
  "negging",
  "peacocking",
  "white-knighting",
  "simping-for",
  "parasocially-attached-to",
  "catastrophizing-about",
  "spiraling-over",
  // physical comedy
  "tripping-over",
  "spilling-on",
  "sitting-on",
  "stepping-in",
  "walking-into",
  "falling-off",
  "leaning-on",
  "crawling-under",
  "hiding-behind",
  "running-from",
  "chasing",
  "yeeting",
  // cooking show
  "slow-roasting",
  "deep-frying",
  "sous-viding",
  "flame-grilling",
  "pressure-cooking",
  "fermenting",
  "pickling",
  "smoking",
  "curing",
  "dry-aging",
  "tempering",
  "reducing",
  "deglazing",
  "caramelizing",
  // legal proceedings
  "suing",
  "subpoenaing",
  "deposing",
  "cross-examining",
  "objecting-to",
  "sustaining",
  "overruling",
  "plea-bargaining",
  "mistrialing",
  "appealing",
  "filibustering",
  "gerrymandering",
  "lobbying",
  // nature documentary
  "stalking",
  "ambushing",
  "migrating-toward",
  "nesting-in",
  "hibernating-near",
  "camouflaging-as",
  "molting-on",
  "pollinating",
  "symbioting-with",
  "parasitizing",
  "photosynthesizing-at",
  // crimes against humanity
  "war-criming",
  "insider-trading",
  "money-laundering",
  "embezzling",
  "blackmailing",
  "catfishing",
  "swatting",
  "doxing",
  "astroturfing",
  "price-fixing",
  "union-busting",
  "wage-thieving",
  "tax-evading",
  "evidence-tampering",
  "witness-intimidating",
  "jaywalking-past",
  // bodily
  "projectile-vomiting-on",
  "ugly-crying-at",
  "dry-heaving-near",
  "stress-eating",
  "rage-eating",
  "hate-eating",
  "comfort-eating",
  "revenge-eating",
  "spite-drinking",
  // internet crimes
  "rickrolling",
  "phishing",
  "social-engineering",
  "brute-forcing",
  "sql-injecting",
  "xss-ing",
  "man-in-the-middling",
  "zero-daying",
  "ransomwaring",
  "cryptomining-on",
  // chaotic neutral
  "girlbossing-past",
  "gaslight-gatekeep-girlbossing",
  "manifesting",
  "unaliving",
  "speedrunning-past",
  "any-percenting",
  "glitch-hunting",
  "out-of-bounding",
  "sequence-breaking",
  "wall-clipping-through",
] as const;

const NOUNS = [
  // creatures
  "gremlin",
  "goblin",
  "raccoon",
  "possum",
  "platypus",
  "cryptid",
  "mothman",
  "bigfoot",
  "chupacabra",
  "jackalope",
  "basilisk",
  "hydra",
  "minotaur",
  "kraken",
  "leviathan",
  "behemoth",
  "wendigo",
  "banshee",
  "poltergeist",
  // compound creatures
  "trash-panda",
  "chaos-monkey",
  "danger-noodle",
  "murder-hornet",
  "dust-bunny",
  "code-monkey",
  "bug-bear",
  "server-hamster",
  "deploy-pigeon",
  "merge-shark",
  // objects of despair
  "dumpster",
  "toaster",
  "roomba",
  "printer",
  "fax-machine",
  "beeper",
  "crt-monitor",
  "floppy-disk",
  "zip-drive",
  "blackberry",
  "palm-pilot",
  // food
  "noodle",
  "potato",
  "pickle",
  "cactus",
  "turnip",
  "walnut",
  "pretzel",
  "burrito",
  "waffle",
  "nugget",
  "crouton",
  "anchovy",
  "haggis",
  "lutefisk",
  // disasters
  "tire-fire",
  "dumpster-fire",
  "hot-mess",
  "train-wreck",
  "clown-car",
  "house-of-cards",
  "jenga-tower",
  "avalanche",
  "sinkhole",
  "shipwreck",
  "landfill",
  "superfund-site",
  "brownfield",
  "tar-pit",
  // office supplies of war
  "paper-clip",
  "rubber-duck",
  "duct-tape",
  "zip-tie",
  "bailing-wire",
  "sticky-note",
  "whiteboard",
  "swivel-chair",
  "standing-desk",
  "bean-bag",
  // mistakes
  "regret",
  "mistake",
  "incident",
  "oopsie",
  "yolo",
  "todo",
  "hack",
  "kludge",
  "bodge",
  "workaround",
  "tech-debt",
  "legacy-code",
  "prod-hotfix",
  "foot-gun",
  "bear-trap",
  "land-mine",
  "time-bomb",
  "hand-grenade",
  "banana-peel",
  "trap-door",
  "quicksand",
  "plot-hole",
  // bugs
  "segfault",
  "nil-pointer",
  "race-condition",
  "deadlock",
  "memory-leak",
  "stack-overflow",
  "buffer-overrun",
  "off-by-one",
  "heisenbug",
  "mandelbug",
  "schroedinbug",
  "bohrbug",
  "hindenbug",
  "loch-ness-bug",
  "ufo-bug",
  // architecture astronautics
  "spaghetti",
  "lasagna",
  "ravioli",
  "god-object",
  "singleton",
  "anti-pattern",
  "code-smell",
  "cargo-cult",
  "bikeshed",
  "yak",
  "sacred-cow",
  "golden-hammer",
  "silver-bullet",
  "ivory-tower",
  // infrastructure nightmares
  "zombie-process",
  "orphan-thread",
  "phantom-read",
  "dirty-read",
  "thundering-herd",
  "dogpile",
  "cascade-failure",
  "split-brain",
  "poison-pill",
  "black-hole",
  "wormhole",
  "event-horizon",
  // meetings and process
  "jira-ticket",
  "slack-thread",
  "zoom-call",
  "standup",
  "retro",
  "post-mortem",
  "blameless-incident",
  "war-room",
  "sev-zero",
  "on-call-page",
  "alert-fatigue",
  "toil",
  "runbook",
  "playbook",
  "flaky-test",
  "ci-pipeline",
  "merge-conflict",
  "rebase-hell",
  "sprint-debt",
  "velocity-chart",
  "burndown",
  "kanban-board",
  // corpo artifacts
  "okr",
  "kpi",
  "roi",
  "synergy",
  "paradigm-shift",
  "disruption",
  "blockchain",
  "metaverse",
  "web3",
  "nft",
  "pivot",
  "unicorn",
  "hockey-stick",
  "moat",
  "flywheel",
  "north-star",
  "guardrail",
  // kitchen nightmares
  "soggy-bottom",
  "raw-chicken",
  "mystery-sauce",
  "day-old-sushi",
  "gas-station-sushi",
  "airport-sandwich",
  "vending-machine-burrito",
  "break-room-microwave",
  "communal-fridge",
  "expired-yogurt",
  // cursed objects
  "monkey-paw",
  "cursed-amulet",
  "haunted-doll",
  "ouija-board",
  "necronomicon",
  "pandoras-box",
  "hope-diamond",
  "ring-of-power",
  // vehicles
  "shopping-cart",
  "segway",
  "unicycle",
  "go-kart",
  "bumper-car",
  "clown-bicycle",
  "pontoon-boat",
  "zamboni",
  "forklift",
  // places you dont want to be
  "liminal-space",
  "backroom",
  "shadow-realm",
  "phantom-zone",
  "bermuda-triangle",
  "room-101",
  "platform-nine",
  "twilight-zone",
  "upside-down",
  "mirror-dimension",
  "quantum-realm",
  // sounds
  "dial-up-tone",
  "fax-screech",
  "windows-xp-startup",
  "sad-trombone",
  "airhorn",
  "vine-boom",
  "bruh-moment",
  "oof",
  "bonk",
  // units of measurement
  "football-field",
  "olympic-pool",
  "banana-for-scale",
  "washing-machine",
  "school-bus",
  "blue-whale",
  "bald-eagle",
  "texas",
  // developer mythology
  "ten-x-engineer",
  "rockstar-ninja",
  "thought-leader",
  "evangelist",
  "full-stack-unicorn",
  "devrel",
  "prompt-engineer",
  "vibe-coder",
  "yaml-engineer",
  "toml-enthusiast",
  "config-sommelier",
  // government secrets
  "classified-document",
  "redacted-memo",
  "epstein-island",
  "watergate-tape",
  "pentagon-papers",
  "area-51-file",
  "roswell-debris",
  "grassy-knoll-photo",
  "deep-throat",
  "smoking-gun",
  // substances
  "bath-salts",
  "tide-pod",
  "four-loko",
  "monster-energy",
  "five-hour-energy",
  "gas-station-pill",
  "sketchy-supplement",
  "preworkout",
  "melatonin-gummy",
  // florida man
  "florida-man",
  "walmart-greeter",
  "waffle-house",
  "dollar-store",
  "pawn-shop",
  "bail-bondsman",
  "payday-loan",
  "check-cashing",
  "scratch-ticket",
  "monster-truck",
  // crimes
  "ponzi-scheme",
  "pyramid-scheme",
  "money-launderer",
  "tax-shelter",
  "shell-company",
  "offshore-account",
  "slush-fund",
  "hush-money",
  "golden-parachute",
  "severance-package",
  // body horror
  "skin-tag",
  "ingrown-hair",
  "kidney-stone",
  "wisdom-tooth",
  "funny-bone",
  "charlie-horse",
  "brain-freeze",
  "sleep-paralysis-demon",
  "intrusive-thought",
  // social media
  "main-character",
  "ratio",
  "cancel-culture",
  "influencer",
  "brand-deal",
  "sponsored-content",
  "engagement-bait",
  "rage-bait",
  "thirst-trap",
  "parasocial-relationship",
  "hot-take-factory",
  "discourse",
  "discourse-horse",
] as const;

function friendlyName(id: string): string {
  const hash = crypto.createHash("md5").update(id).digest();
  // Use 2 bytes per word (0-65535) to minimize modulo bias across list sizes.
  const adj = ADJECTIVES[hash.readUInt16LE(0) % ADJECTIVES.length];
  const verb = VERBS[hash.readUInt16LE(2) % VERBS.length];
  const noun = NOUNS[hash.readUInt16LE(4) % NOUNS.length];
  return `${adj}-${verb}-${noun}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Container spec registered with the pool. */
export interface PoolSpec {
  /** Docker image to pre-warm. */
  image: string;
  /** Port the container listens on. */
  port: number;
  /** Docker network to connect containers to. */
  network: string;
  /** Desired number of warm containers to maintain. */
  size: number;
}

/** Shared config for all pool operations (not per-spec). */
export interface HotPoolConfig {
  /** Shared secret injected into warm containers for provision auth. */
  provisionSecret: string;
  /** Registry auth for pulling images. */
  registryAuth?: { username: string; password: string; serveraddress: string };
  /** Cleanup + replenish interval in ms. Default: 60_000. */
  replenishIntervalMs?: number;
}

/** Result of a successful claim. */
export interface PoolClaim {
  id: string;
  containerId: string;
}

// ---------------------------------------------------------------------------
// HotPool
// ---------------------------------------------------------------------------

export class HotPool {
  private specs = new Map<string, PoolSpec>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private docker: import("dockerode"),
    private repo: IPoolRepository,
    private config: HotPoolConfig,
  ) {}

  // ---- Registration --------------------------------------------------------

  /** Register a container spec. The pool will start warming containers for it. */
  register(key: string, spec: PoolSpec): void {
    this.specs.set(key, { ...spec });
    // Persist desired size to DB for durability across restarts
    this.repo.setPoolSize(spec.size, key).catch((err) => {
      logger.warn(`Hot pool: failed to persist size for "${key}"`, { error: (err as Error).message });
    });
    logger.info(`Hot pool: registered "${key}" (${spec.image}, size=${spec.size})`);
  }

  /** Unregister a spec and drain its containers. */
  async unregister(key: string): Promise<void> {
    this.specs.delete(key);
    // Mark all instances for this key as dead and clean up containers
    const instances = await this.repo.listActive(key);
    for (const instance of instances) {
      await this.repo.markDead(instance.id);
      await this.removeContainer(instance.containerId);
    }
    await this.repo.deleteDead();
    logger.info(`Hot pool: unregistered spec "${key}", drained ${instances.length} container(s)`);
  }

  /** All currently registered spec keys. */
  registeredKeys(): string[] {
    return [...this.specs.keys()];
  }

  // ---- Lifecycle -----------------------------------------------------------

  async start(): Promise<{ stop: () => void }> {
    await this.tick();
    const intervalMs = this.config.replenishIntervalMs ?? 60_000;
    this.timer = setInterval(async () => {
      try {
        await this.tick();
      } catch (err) {
        logger.error("Hot pool tick failed", { error: (err as Error).message });
      }
    }, intervalMs);
    logger.info("Hot pool started");
    return { stop: () => this.stop() };
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // ---- Operations ----------------------------------------------------------

  /** Atomically claim a warm container for the given key. Returns null if pool is empty. */
  async claim(key: string): Promise<PoolClaim | null> {
    const result = await this.repo.claim(key);
    if (result) {
      // Replenish in background to refill the slot
      this.replenish().catch((err) => {
        logger.error("Pool replenish after claim failed", { error: (err as Error).message });
      });
    }
    return result;
  }

  /** Current desired pool size for a key. */
  size(key: string): number {
    return this.specs.get(key)?.size ?? 0;
  }

  /** Update desired pool size for a key. Persists to DB. */
  async resize(key: string, size: number): Promise<void> {
    const spec = this.specs.get(key);
    if (spec) spec.size = size;
    await this.repo.setPoolSize(size, key);
  }

  // ---- Internals -----------------------------------------------------------

  private async tick(): Promise<void> {
    await this.cleanup();
    await this.replenish();
  }

  /**
   * Cleanup: verify every active DB row (warm + claimed) has a live container.
   * If the container is gone or dead, mark the row dead and delete it.
   * Then reconcile orphan Docker containers not tracked in the DB.
   */
  private async cleanup(): Promise<void> {
    const docker = this.docker;

    // 1. Check ALL active instances — mark dead if container is gone
    const activeInstances = await this.repo.listActive();
    const trackedContainerIds = new Set<string>();

    for (const instance of activeInstances) {
      trackedContainerIds.add(instance.containerId);
      try {
        const c = docker.getContainer(instance.containerId);
        const info = await c.inspect();
        const isRunning = info.State.Running && !info.State.Restarting;
        const restartCount = info.RestartCount ?? 0;
        const isCrashLooping = info.State.Restarting || restartCount > 2;
        if (!isRunning || isCrashLooping) {
          await this.repo.markDead(instance.id);
          await this.removeContainer(instance.containerId);
          logger.warn(`Hot pool: dead container ${instance.id} (was ${instance.status})`, {
            running: info.State.Running,
            restarting: info.State.Restarting,
            restartCount,
          });
        }
      } catch {
        await this.repo.markDead(instance.id);
        logger.warn(`Hot pool: missing container ${instance.id} (was ${instance.status})`);
      }
    }

    await this.repo.deleteDead();

    // 2. Orphan reconciliation — pool-* containers not tracked in DB
    try {
      const allContainers = await docker.listContainers({ all: true });
      for (const c of allContainers) {
        const name = (c.Names?.[0] ?? "").replace(/^\//, "");
        if (!name.startsWith("pool-")) continue;
        if (trackedContainerIds.has(c.Id)) continue;
        await this.removeContainer(c.Id);
        logger.info(`Hot pool: removed orphan container ${name}`);
      }
    } catch (err) {
      logger.warn("Hot pool: orphan reconciliation failed (non-fatal)", {
        error: (err as Error).message,
      });
    }
  }

  /** Replenish warm containers for every registered spec. */
  private async replenish(): Promise<void> {
    for (const [key, spec] of this.specs) {
      const current = await this.repo.warmCount(key);
      const deficit = spec.size - current;
      if (deficit <= 0) continue;

      logger.info(`Hot pool [${key}]: replenishing ${deficit} (have ${current}, want ${spec.size})`);
      for (let i = 0; i < deficit; i++) {
        await this.createWarm(key, spec);
      }
    }
  }

  /** Create a single warm container for the given spec. */
  private async createWarm(key: string, spec: PoolSpec): Promise<void> {
    const docker = this.docker;
    const { image, port, network } = spec;
    const { provisionSecret } = this.config;
    const id = crypto.randomUUID();
    const friendly = friendlyName(id);
    const containerName = `pool-${key}-${friendly}`;
    const volumeName = `pool-${key}-${friendly}`;

    try {
      // Pull image
      try {
        const auth = this.config.registryAuth;
        const [fromImage, tag] = image.includes(":") ? image.split(":") : [image, "latest"];
        logger.info(`Hot pool: pulling ${image} (auth: ${auth ? `${auth.username}@${auth.serveraddress}` : "none"})`);
        const authArg = auth
          ? { username: auth.username, password: auth.password, serveraddress: auth.serveraddress }
          : {};
        const stream: NodeJS.ReadableStream = await docker.createImage(authArg, { fromImage, tag });
        await new Promise<void>((resolve, reject) => {
          docker.modem.followProgress(stream, (err: Error | null) => (err ? reject(err) : resolve()));
        });
      } catch (pullErr) {
        logger.warn(`Hot pool: image pull failed for ${image}`, { key, error: (pullErr as Error).message });
      }

      // Init volume — clear stale embedded-PG data
      const init = await docker.createContainer({
        Image: image,
        Entrypoint: ["/bin/sh", "-c"],
        Cmd: ["rm -rf /data/* /data/.* 2>/dev/null; chown -R 999:999 /data || true"],
        User: "root",
        HostConfig: { Binds: [`${volumeName}:/data`] },
      });
      await init.start();
      await init.wait();
      await init.remove();

      // Wrap original entrypoint with cleanup
      const imageInfo = await docker.getImage(image).inspect();
      const rawEntrypoint = imageInfo.Config?.Entrypoint ?? [];
      const rawCmd = imageInfo.Config?.Cmd ?? [];
      const origEntrypoint: string[] = Array.isArray(rawEntrypoint) ? rawEntrypoint : [rawEntrypoint];
      const origCmd: string[] = Array.isArray(rawCmd) ? rawCmd : [rawCmd];
      const fullCmd = [...origEntrypoint, ...origCmd].join(" ");
      const cleanupAndExec = `rm -rf /paperclip/instances/default/db 2>/dev/null; exec ${fullCmd}`;

      const warmContainer = await docker.createContainer({
        Image: image,
        name: containerName,
        Entrypoint: ["/bin/sh", "-c"],
        Cmd: [cleanupAndExec],
        Env: [`PORT=${port}`, `WOPR_PROVISION_SECRET=${provisionSecret}`, "HOME=/data"],
        HostConfig: {
          Binds: [`${volumeName}:/data`],
          RestartPolicy: { Name: "on-failure", MaximumRetryCount: 3 },
        },
      });

      await warmContainer.start();

      // Connect to Docker network
      const targetNetwork = network || "platform";
      try {
        const net = docker.getNetwork(targetNetwork);
        await net.connect({ Container: warmContainer.id });
        logger.info(`Hot pool: connected ${containerName} to network ${targetNetwork}`);
      } catch (netErr) {
        logger.warn(`Hot pool: network connect failed for ${containerName}`, {
          error: (netErr as Error).message,
        });
      }

      await this.repo.insertWarm(id, warmContainer.id, key, image);
      logger.info(`Hot pool: created warm container ${containerName} (${id}) for "${key}"`);
    } catch (err) {
      logger.error("Hot pool: failed to create warm container", { key, error: (err as Error).message });
    }
  }

  /** Best-effort stop + remove a Docker container. */
  private async removeContainer(containerId: string): Promise<void> {
    try {
      const c = this.docker.getContainer(containerId);
      await c.stop().catch(() => {});
      await c.remove({ force: true });
    } catch {
      /* already gone */
    }
  }
}
