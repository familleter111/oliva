import { MEDIA_NAME, readMedia } from "@/lib/server/services/media";
import { isPublishedFile } from "@/lib/server/services/menu";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Introuvable", { status: 404, headers: { "Cache-Control": "no-store" } });

/** Images publiques : seules celles de la version publiée sont servies. */
export async function GET(_req: Request, ctx: { params: Promise<{ fichier: string }> }) {
  const { fichier } = await ctx.params;
  if (!MEDIA_NAME.test(fichier)) return notFound();
  try {
    if (!(await isPublishedFile(fichier))) return notFound();
    const data = await readMedia(fichier);
    if (!data) return notFound();
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return notFound();
  }
}
