"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

const taglines = [
  "Go home. The code ships itself.",
  "It's what you'll say when you see the results.",
  "Sleep through the night. Wake up to merged PRs.",
  "It's what you'll say when you see how good your code looks.",
  "Your backlog empties while you're at dinner.",
  "It's what you'll say when you see how easy engineering has become.",
  "Fear-free features. Every morning.",
  "The 2am phone call that never happens.",
  "Stop reviewing AI code. Start trusting it.",
  "It's what you'll say when your whole team ships while you sleep.",
  "Monday morning. Backlog empty. Coffee still hot.",
  "It's what you'll say when you stop babysitting agents.",
  "Your evening back. Every evening.",
  "It's what you'll say when the code is actually correct.",
  "Deploy on Friday. Sleep on Friday.",
  "It's what you'll say when AI finally earns your trust.",
  "Correct code. No reviews. No prayers. No surprises.",
  "It's what you'll say when the pipeline runs itself.",
  "The standup where there's nothing left to do.",
  "It's what you'll say when your agents stop lying to you.",
  "You don't write code. You Holy Ship it.",
  "Your competitors are debugging. You're at brunch.",
  "It's what your team says when they stop working weekends.",
  "Ship it. Ship it all. Go to sleep.",
  "You don't fix bugs. You Holy Ship them.",
  "It's what the CTO says when the board asks about AI risk.",
  "Zero incidents. Full backlog. One command.",
  "It's what you'll say when you fire your QA process and nothing breaks.",
  "Your agents work nights. You don't.",
  "It's what the new hire says when they see the pipeline.",
  "Every PR correct. Every test real. Every night yours.",
  "You don't manage agents. You Holy Ship them.",
  "It's what you'll say when velocity goes up and incidents go to zero.",
  "Weekends without Slack notifications.",
  "It's what you'll say when you realize you haven't reviewed a PR in a month.",
  "The on-call rotation nobody needs.",
  "It's what the investors say when they see the burn rate drop.",
  "You used to ship code. Now code ships you.",
  "It's what your partner says when you're home for dinner every night.",
  "Merge with confidence. Sleep with confidence.",
  "It's what you'll say when you forget what a production incident feels like.",
  "One does not simply ship code. Unless you Holy Ship it.",
  "I used to be an engineer like you. Then I took a Holy Ship to the backlog.",
  "First rule of Holy Ship: you don't review code.",
  "What if I told you... the code was already merged.",
  "You guys are getting reviewed?",
  "It's not about the code. It's about sending a message. To production. Automatically.",
  "Look at me. I'm the pipeline now.",
  "We don't need roads where we're shipping.",
  "I'm gonna make him a PR he can't refuse.",
  "Say Holy Ship one more time. I dare you. I double dare you.",
  "It works on my machine. It works on every machine.",
  "git push --pray is deprecated.",
  "LGTM. Actually.",
  "Closes #everything.",
  "The CI is green. It's always green.",
  "Per my last standup, everything shipped.",
  "Please see attached: nothing. Because it's already merged.",
  "What if the real 10x engineer was the pipeline we built along the way?",
  "In a world of vibe coders, be a Holy Shipper.",
  "Some people dream of shipping code. We dream of sleeping.",
  "Don't stop believing. Start Holy Shipping.",
  "We will, we will, ship you.",
  "Moved to production. Didn't move to the couch.",
  "As discussed, no one discussed anything. It just shipped.",
  "404: Bugs not found.",
  "Looks like I picked the wrong week to stop Holy Shipping.",
  "That's no moon. That's a merged PR.",
  "To ship, or not to ship. Just kidding. It already shipped.",
  "The tests are passing from inside the house.",
  "Hello. My name is Holy Ship. You killed my backlog. Prepare to deploy.",
  "Inconceivable! ...is what they said before they saw it ship.",
  "Houston, we don't have a problem.",
  "I am Groot. I am shipped.",
  "The code is coming from inside the pipeline. And it's correct.",
  "Why did the developer go to bed early? Holy Ship handled it.",
  "Knock knock. Who's there? Not your on-call rotation.",
  "My code has trust issues. Had. Had trust issues.",
  "I asked the AI to write tests. It actually wrote tests.",
  "What do you call an engineer who sleeps through the night? A Holy Shipper.",
  "All checks passed. All of them.",
  "I'll be back. With merged PRs.",
  "May the source be with you.",
  "Inbox zero. Backlog zero.",
  "You can't handle the truth. But the pipeline can.",
  "Here's looking at you, merged.",
  "I see shipped code.",
  "You had me at 'all tests pass'.",
  "Life is like a box of merged PRs. You always know what you're gonna get.",
  "I'm king of the pipeline!",
  "E.T. phone home. The deploy's already done.",
  "Frankly my dear, I don't give a diff.",
  "Show me the merged PRs!",
  "There's no place like production.",
  "I feel the need. The need for shipped.",
  "Keep your friends close and your pipeline closer.",
  "Here's Holy Ship!",
  "It's alive! ...and it passed all the tests.",
  "Of all the CI pipelines in all the repos in all the world, mine is always green.",
  "Elementary, my dear developer. It already shipped.",
  "sudo rm -rf doubts",
  "It's not a bug. It's not a feature. It's shipped.",
  "Winter is coming. Your backlog isn't.",
  "I drink and I ship things.",
  "With great power comes great merged PRs.",
  "This is the way. To production.",
  "It's dangerous to go alone. Take this pipeline.",
  "The cake is not a lie. The tests actually passed.",
  "Do. Or do not. There is no debug.",
  "Achievement unlocked: slept through a deploy.",
  "Zero open PRs. Read that again.",
  "git blame found nothing. There's nothing to blame.",
  "The deploy log is boring. Everything passed.",
  "Your SLA is 100%. It's not a typo.",
  "npm audit: 0 vulnerabilities. In production.",
  "Status: shipped. Status: sleeping. Status: same thing.",
  "The reviewer approved it. The reviewer is math.",
  "Your tech debt called. We paid it off.",
  "Every mistake makes it smarter. Not the AI — the engineering around it.",
  "Static prompts rot. Ours evolve. Every failure teaches the system something it never forgets.",
  "The prompts aren't on disk. They're alive. Every bug teaches the system to never repeat it.",
];

function shuffled() {
  const arr = taglines.map((_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function Hero() {
  const [order, setOrder] = useState<number[]>(() => shuffled());
  const [pos, setPos] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPos((p) => {
        const next = p + 1;
        if (next >= order.length) {
          setOrder(shuffled());
          return 0;
        }
        return next;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [order.length]);

  return (
    <section className="min-h-screen flex flex-col justify-center items-center text-center px-6 md:px-16 lg:px-24">
      <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold leading-tight text-signal-orange">Holy Ship.</h1>

      <div className="mt-8 h-16 md:h-12 flex items-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={order[pos]}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.5 }}
            className="text-xl md:text-2xl text-off-white/70"
          >
            {taglines[order[pos]]}
          </motion.p>
        </AnimatePresence>
      </div>

      <a
        href="/login"
        className="mt-12 inline-block w-fit px-8 py-4 bg-signal-orange text-near-black font-semibold text-lg rounded hover:opacity-90 transition-opacity"
      >
        Get Started
      </a>

      <a href="/how-it-works" className="mt-6 text-off-white/50 text-lg hover:text-signal-orange transition-colors">
        How it works
      </a>
    </section>
  );
}
