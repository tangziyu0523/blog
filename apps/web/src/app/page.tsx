import { fetchPublishedPosts } from "@/lib/posts";
import { PostCard } from "@/components/PostCard";
import { Masthead } from "@/components/Masthead";
import { HeadlinePost } from "@/components/HeadlinePost";
import { ScrollReveal } from "@/components/ScrollReveal";
import { HeroZone } from "@/components/HeroZone";
import { RevealText } from "@/components/RevealText";
import { ChapterStage } from "@/components/ChapterStage";
import { Marquee } from "@/components/Marquee";
import {
  Butterfly2,
  Foliage2,
  Bird1,
  Flower2,
  Butterfly4,
  Foliage3,
} from "@/components/illustrations";

// Plates rotated through the list rows that earn an illustration.
const LIST_PLATES = [Butterfly2, Foliage2, Bird1, Flower2, Butterfly4, Foliage3];

// Full-viewport book page; also the reduced-motion stacked-page unit.
const PAGE = "flex min-h-screen flex-col justify-center";
const KICKER = "font-sans text-[10px] uppercase tracking-[0.25em]";

export default async function Home() {
  const { items, total } = await fetchPublishedPosts();
  const [headline, ...rest] = items;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 pb-24">
      <HeroZone>
        {/* Curated book pages — fixed editorial content, not the article stream. */}
        <ChapterStage>
          {/* Page 1 — the masthead spread */}
          <section className={PAGE}>
            <Masthead issue={total} />
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

        {items.length === 0 && (
          <p className="mt-16" style={{ color: "var(--text-3)" }}>
            还没有发布的文章。
          </p>
        )}

        {items.length > 0 && <HeadlinePost post={headline} />}

        {rest.length > 0 && (
          <ScrollReveal key={`home-${items.length}`}>
            <section className="mt-16">
              {rest.map((post, i) => {
                // Rhythm: every other row carries a mid-size plate.
                const withPlate = i % 2 === 0;
                const Plate = withPlate
                  ? LIST_PLATES[Math.floor(i / 2) % LIST_PLATES.length]
                  : undefined;
                return (
                  <PostCard
                    key={post.id}
                    post={post}
                    index={i + 2}
                    illustration={Plate}
                  />
                );
              })}
            </section>
          </ScrollReveal>
        )}
      </HeroZone>
    </main>
  );
}
