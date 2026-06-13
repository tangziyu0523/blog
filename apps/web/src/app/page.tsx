import { fetchPublishedPosts } from "@/lib/posts";
import { PostCard } from "@/components/PostCard";
import { Masthead } from "@/components/Masthead";
import { HeadlinePost } from "@/components/HeadlinePost";
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

export default async function Home() {
  const { items, total } = await fetchPublishedPosts();
  const [headline, ...rest] = items;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 pb-24">
      <Masthead issue={total} />

      {items.length === 0 ? (
        <p className="mt-16" style={{ color: "var(--text-3)" }}>
          还没有发布的文章。
        </p>
      ) : (
        <>
          <HeadlinePost post={headline} />

          {rest.length > 0 && (
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
          )}
        </>
      )}
    </main>
  );
}
