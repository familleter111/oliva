import { ShieldWarning } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { LanguageSwitch } from "@/components/i18n";
import { Card } from "@/components/ui";
import { currentAuth } from "@/lib/server/auth/session";
import { LogoutButton } from "./logout";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Accès refusé", robots: { index: false, follow: false } };

export default async function DeniedPage() {
  const auth = await currentAuth();
  if (!auth) redirect("/admin/login");
  return (
    <main className="grid min-h-[100dvh] place-items-center px-6">
      <BackButton floating fallback="/" />
      <LanguageSwitch floating />
      <Card className="max-w-lg p-8 text-center">
        <ShieldWarning size={44} className="mx-auto text-warn" />
        <h1 className="mt-3 text-[1.9rem] leading-tight font-bold">Accès refusé</h1>
        <p className="mt-2 text-muted">
          Votre compte ({auth.role.nom}) ne dispose pas des droits nécessaires pour cette page. Demandez à un administrateur d'ajuster votre rôle si besoin.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {auth.can("tables.affecter") ? (
            <a href="/responsable" className="press inline-flex h-10 items-center rounded-[10px] border border-line-strong bg-white px-4 text-[15px] hover:bg-olive-tint">
              Aller à mon espace responsable
            </a>
          ) : null}
          {auth.can("commandes.servir") && !auth.can("tables.affecter") ? (
            <a href="/salle" className="press inline-flex h-10 items-center rounded-[10px] border border-line-strong bg-white px-4 text-[15px] hover:bg-olive-tint">
              Aller à mon espace serveur
            </a>
          ) : null}
          {auth.can("preparation.changer") && !auth.can("commandes.servir") && !auth.can("tables.affecter") ? (
            <a href="/cuisine" className="press inline-flex h-10 items-center rounded-[10px] border border-line-strong bg-white px-4 text-[15px] hover:bg-olive-tint">
              Aller à mon écran de cuisine
            </a>
          ) : null}
          {auth.can("admin.acces") ? (
            <a href="/admin" className="press inline-flex h-10 items-center rounded-[10px] border border-line-strong bg-white px-4 text-[15px] hover:bg-olive-tint">
              Retour à la vue d'ensemble
            </a>
          ) : null}
          <LogoutButton csrf={auth.csrf} />
        </div>
      </Card>
    </main>
  );
}
