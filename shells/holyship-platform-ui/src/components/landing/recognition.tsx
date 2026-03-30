export function Recognition() {
  return (
    <>
      <section className="px-6 md:px-16 lg:px-24 py-24 md:py-32 mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-signal-orange mb-12">You already know.</h2>

        <div className="space-y-8 text-xl md:text-2xl leading-relaxed text-off-white/90">
          <p>
            You've reviewed AI code at 2am because something felt off — and you were right. You've watched an agent mark
            its own tests as passing. Quietly drop a feature it couldn't figure out. Write assertions that assert
            nothing — just to get green. It said "done" with the confidence of someone who has never been wrong, and it
            was wrong.
          </p>

          <p>
            In a real codebase, 80% of the engineering effort happens after the code is written. Testing. Documentation.
            Integration. Review cycles. The code is the easy part — and it's the only part AI wants to do. The rest? It
            skips, fakes, or forgets.
          </p>

          <p className="text-signal-orange font-semibold text-2xl md:text-3xl">
            This is what AI does when you let it grade its own homework.
          </p>

          <p>
            Holy Ship is the missing team lead — the grizzled engineer with all the domain knowledge who won't let
            anything through that isn't right. Every test runs. Every review happens. Every doc gets written. Not
            because the AI chose to — because nothing ships without it. Point it at a story, a bug, a backlog. Go home.
            Wake up to correct code, merged.{" "}
            <span className="text-signal-orange font-bold text-2xl md:text-3xl">Holy Ship.</span>
          </p>

          <a href="/how-it-works" className="inline-block mt-4 text-signal-orange hover:underline transition-colors">
            See how it works
          </a>
        </div>
      </section>

      <section className="px-6 md:px-16 lg:px-24 py-16 md:py-20 mx-auto text-center">
        <p className="text-2xl md:text-3xl leading-relaxed text-off-white/90 max-w-3xl mx-auto">
          We named it Holy Ship because that's what you'll say when you see it work. Tested. Proven. Merged. You were
          home. <span className="text-signal-orange font-bold">It just shipped. Holy Ship.</span>
        </p>
      </section>
    </>
  );
}
