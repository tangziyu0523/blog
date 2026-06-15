import { fetchPosts } from "@/lib/posts";
import { Masthead } from "@/components/Masthead";
import { RevealText } from "@/components/RevealText";
import { HeroZone } from "@/components/HeroZone";
import { ChapterStage } from "@/components/ChapterStage";
import { Marquee } from "@/components/Marquee";
import { PostList } from "@/components/PostList";
import { Bird1, Flower2 } from "@/components/illustrations";

const PAGE = "flex min-h-screen flex-col justify-center";
const KICKER = "font-sans text-[10px] uppercase tracking-[0.25em]";

export default async function Home() {
  const initial = await fetchPosts("latest");

  return (
    <main className="mx-auto w-full max-w-5xl px-6 pb-24">
      <HeroZone>
        {/* Curated book pages — fixed editorial content, not the article stream. */}
        <ChapterStage>
          {/* Page 1 — the masthead spread */}
          <section className={PAGE}>
            <Masthead issue={initial.total} />
            <RevealText
              className="mt-8 max-w-2xl"
              style={{
                fontStyle: "italic",
                color: "var(--text-2)",
                fontSize: "clamp(18px, 2.4vw, 24px)",
                lineHeight: 1.5,
              }}
            >
              Field notes from the edges of systems and software — observed
              slowly, drawn by hand, and pressed here like specimens between the
              pages.
            </RevealText>
          </section>

          {/* Page 2 — editor's note */}
          <section className={PAGE}>
            <div className="relative max-w-2xl">
              <Bird1
                width={120}
                height={120}
                className="absolute -top-6 right-0 opacity-80"
              />
              <p className={KICKER} style={{ color: "var(--accent)" }}>
                From the Editor
              </p>
              <h2
                className="mt-4"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(34px, 6vw, 60px)",
                  lineHeight: 1.05,
                }}
              >
                On Slow
                <br />
                Observation
              </h2>
              <p
                className="mt-6"
                style={{ color: "var(--text-2)", lineHeight: 1.7 }}
              >
                This is a notebook kept in the old naturalist habit: look long
                before you name, draw before you classify, and let the specimen
                tell you what it is. The articles that follow are dated entries;
                these opening pages are the standing matter — the why.
              </p>
            </div>
          </section>

          {/* Page 3 — a pressed pull-quote */}
          <section className={PAGE}>
            <div className="relative max-w-3xl">
              <Flower2
                width={140}
                height={140}
                className="absolute -top-10 -left-6 opacity-70"
              />
              <blockquote
                className="relative"
                style={{
                  fontFamily: "var(--font-display)",
                  fontStyle: "italic",
                  fontSize: "clamp(28px, 5vw, 52px)",
                  lineHeight: 1.2,
                }}
              >
                Every system, observed closely enough, becomes natural history.
              </blockquote>
              <p
                className={`${KICKER} mt-8`}
                style={{ color: "var(--text-3)" }}
              >
                — Naturalis Historia
              </p>
            </div>
          </section>
        </ChapterStage>

        {/* 开书成索引 — the book opens into the running index. */}
        <Marquee
          className="my-12 border-y py-3"
          style={{ borderColor: "var(--border)" }}
        />

        <div id="article-index">
          <PostList initial={initial} />
        </div>
      </HeroZone>
    </main>
  );
}
