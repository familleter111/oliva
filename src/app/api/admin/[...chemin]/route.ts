import { handle } from "@/lib/server/api/core";
import { adminRoutes } from "@/lib/server/api/routes";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ chemin: string[] }> };

// Chaque méthode passe par le même contrôle : origine, session, jeton, permission, validation.
const run = async (req: Request, ctx: Context) => handle(req, (await ctx.params).chemin, adminRoutes);

export { run as GET, run as POST, run as PUT, run as PATCH, run as DELETE };
