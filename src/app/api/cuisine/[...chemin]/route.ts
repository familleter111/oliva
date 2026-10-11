import { handle } from "@/lib/server/api/core";
import { cuisineRoutes } from "@/lib/server/api/routes/cuisine";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ chemin: string[] }> };

// Même contrôle que l'administration, sans la permission `admin.acces` : origine, session, jeton, permission.
const run = async (req: Request, ctx: Context) => handle(req, (await ctx.params).chemin, cuisineRoutes, "personnel");

export { run as GET, run as POST };
