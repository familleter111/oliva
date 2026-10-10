import { handleTable } from "@/lib/server/api/table";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ chemin: string[] }> };

// API des convives : aucune session du personnel, tout repose sur le jeton de table posé par « rejoindre ».
const run = async (req: Request, ctx: Context) => handleTable(req, (await ctx.params).chemin);

export { run as GET, run as POST, run as PATCH, run as DELETE };
