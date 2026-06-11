import { fetchPublishedPosts } from "@/lib/posts";
import { PostCard } from "@/components/PostCard";

export default async function Home() {
  const { items } = await fetchPublishedPosts();
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl" style={{ fontFamily: "var(--font-display)" }}>
        Naturalist Journal
      </h1>
      <p className="mt-2 italic" style={{ color: "var(--text-2)" }}>
        ✦ Naturalis Historia ✦
      </p>
      <div className="mt-10 flex flex-col gap-6">
        {items.length === 0 ? (
          <p style={{ color: "var(--text-3)" }}>还没有发布的文章。</p>
        ) : (
          items.map((p) => <PostCard key={p.id} post={p} />)
        )}
      </div>
    </main>
  );
}
