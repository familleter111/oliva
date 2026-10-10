import { NextResponse, type NextRequest } from "next/server";

/**
 * Deux rôles, exécutés avant le rendu des pages :
 *
 * 1. Premier filtre de l'administration, peu coûteux : sans cookie de session, renvoi vers la connexion.
 *    Ce n'est pas la protection. Chaque page et chaque API revérifie la session et les permissions côté serveur.
 * 2. Politique de sécurité du contenu (CSP) avec un nonce par requête : seuls les scripts émis par
 *    l'application s'exécutent. Next.js applique ce nonce à ses propres scripts pendant le rendu.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const open = pathname === "/admin/login" || pathname.startsWith("/admin/invitation/");
    const has = req.cookies.has("oliva_session") || req.cookies.has("__Host-oliva_session");
    if (!open && !has) return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    // En développement, React a besoin de `eval` pour ses outils de débogage. Jamais en production.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Les couleurs du menu et les positions du plan de salle sont posées en attributs `style`.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [
    // L'administration passe toujours par le filtre, préchargements compris.
    "/admin",
    "/admin/:path*",
    // Les autres pages reçoivent la politique de contenu. Fichiers statiques, images et API exclus.
    {
      source: "/((?!api|_next/static|_next/image|media|brand|favicon.ico|favicon.png|icon.svg).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
