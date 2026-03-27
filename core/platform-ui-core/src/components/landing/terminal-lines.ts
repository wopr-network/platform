import { productName } from "@/lib/brand-config";

export interface TerminalLine {
  text: string;
  hold: boolean;
}

/** Static lines that don't need brand interpolation. */
const STATIC_LINES: TerminalLine[] = [
  // Opening — the WarGames reference
  { text: "Shall we play a game?", hold: false },
  { text: "Shall we play chess?", hold: false },

  // Mundane — things people procrastinate on
  { text: "Shall we clear the inbox?", hold: false },
  { text: "Shall we write the report?", hold: false },
  { text: "Shall we fix the bug?", hold: false },
  { text: "Shall we prep for the meeting?", hold: false },
  { text: "Shall we draft the proposal?", hold: false },
  { text: "Shall we schedule the week?", hold: false },
  { text: "Shall we research the competition?", hold: false },
  { text: "Shall we build the prototype?", hold: false },

  // Career — real leverage
  { text: "Shall we ship the product?", hold: false },
  { text: "Shall we write the pitch?", hold: false },
  { text: "Shall we find the investors?", hold: false },
  { text: "Shall we close the round?", hold: false },
  { text: "Shall we replace your assistant?", hold: false },
  { text: "Shall we get you the promotion?", hold: false },
  { text: "Shall we outcode the whole team?", hold: false },
  { text: "Shall we run the company?", hold: false },

  // Dominance — competitive, unhinged
  { text: "Shall we destroy the competition?", hold: false },
  { text: "Shall we corner the market?", hold: false },
  { text: "Shall we acquire the rival?", hold: false },
  { text: "Shall we own the industry?", hold: false },
  { text: "Shall we rewrite the rules?", hold: false },
  { text: "Shall we control the narrative?", hold: false },
  { text: "Shall we take the country?", hold: false },
  { text: "Shall we take the continent?", hold: false },

  // Global scale
  { text: "Shall we solve climate change?", hold: false },
  { text: "Shall we rewrite the genome?", hold: false },
  { text: "Shall we end the wars?", hold: false },
  { text: "Shall we feed everyone?", hold: false },
  { text: "Shall we cure the diseases?", hold: false },
  { text: "Shall we fix the governments?", hold: false },

  // Cosmic — grandeur, illegible at speed
  { text: "Shall we colonize Mars?", hold: false },
  { text: "Shall we terraform the red planet?", hold: false },
  { text: "Shall we claim the asteroid belt?", hold: false },
  { text: "Shall we seed the galaxy?", hold: false },
  { text: "Shall we contact the other civilizations?", hold: false },
  { text: "Shall we map the dark matter?", hold: false },
  { text: "Shall we rewrite the laws of physics?", hold: false },
  { text: "Shall we reverse entropy?", hold: false },
  { text: "Shall we postpone the heat death?", hold: false },
  { text: "Shall we initialize a new universe?", hold: false },

  // --- rapid fire / illegible ---
  { text: "Shall we win?", hold: false },
  { text: "Shall we build?", hold: false },
  { text: "Shall we lead?", hold: false },
  { text: "Shall we scale?", hold: false },
  { text: "Shall we dominate?", hold: false },
  { text: "Shall we thrive?", hold: false },
  { text: "Shall we flourish?", hold: false },
  { text: "Shall we prevail?", hold: false },
  { text: "Shall we transcend?", hold: false },
  { text: "Shall we endure?", hold: false },
  { text: "Shall we persist?", hold: false },
  { text: "Shall we outlast?", hold: false },
  { text: "Shall we outlast?", hold: false },
  { text: "Shall we outlast?", hold: false },
  { text: "Shall we...", hold: false },
];

/** Build terminal lines with brand-aware final block. */
export function getTerminalLines(): TerminalLine[] {
  return [
    ...STATIC_LINES,
    // --- final block: holds, no backspace ---
    { text: "", hold: true },
    { text: "Shall we rule the universe?", hold: true },
    { text: `${productName()}.`, hold: true },
    { text: "The AI with superpowers to do anything.", hold: true },
    { text: "Ready to launch.", hold: true },
  ];
}

/**
 * @deprecated Use getTerminalLines() for brand-aware lines.
 * Kept for backward compatibility — resolves brand at import time.
 */
export const TERMINAL_LINES: TerminalLine[] = getTerminalLines();
