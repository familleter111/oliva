import type { Metadata } from "next";
import { BackButton } from "@/components/back-button";
import { LanguageSwitch } from "@/components/i18n";
import { Callout, Card, Wordmark } from "@/components/ui";
import { safeEqual, tokenHash } from "@/lib/server/auth/crypto";
import { ID } from "@/lib/server/defaults";
import { readDb } from "@/lib/server/storage";
import { TokenForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Activer votre compte", robots: { index: false, follow: false } };

export default async function InvitationPage({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const db = await readDb();
  const hash = jeton.length >= 20 && jeton.length <= 200 ? tokenHash(jeton) : "";
  const user = hash ? db.Utilisateurs.find((u) => u.jetonHash !== "" && safeEqual(u.jetonHash, hash)) : undefined;
  const valid = !!user && Date.parse(user.jetonExpireLe) > Date.now() && user.statut !== "suspendu";
  const policy = db.ParametresSecurite.find((p) => p.id === ID.securite);
  const role = db.Roles.find((r) => r.id === user?.roleId);
  const invitation = user?.jetonType === "invitation";

  return (
    <main className="grid min-h-[100dvh] place-items-center px-5 py-10">
      <BackButton floating fallback="/admin/login" />
      <LanguageSwitch floating />
      <Card className="w-full max-w-[460px] animate-rise p-7 sm:p-9">
        <div className="flex justify-center">
          <Wordmark subtitle={db.Restaurant[0]?.sousTitre || "Administration"} />
        </div>
        {valid && user ? (
          <>
            <h1 className="mt-7 text-[1.8rem] leading-tight font-bold">{invitation ? `${db.Restaurant[0]?.nom || "Oliva"} vous invite à rejoindre son équipe.` : "Choisissez un nouveau mot de passe."}</h1>
            <p className="mt-2 text-muted">
              {invitation ? `Bonjour ${user.prenom}, votre compte ${role ? `(${role.nom}) ` : ""}est prêt. Choisissez votre mot de passe pour l'activer.` : `Compte : ${user.email}`}
            </p>
            <TokenForm jeton={jeton} email={user.email} invitation={invitation} min={policy?.motDePasseMin ?? 10} lettreChiffre={policy?.exigerLettreChiffre ?? true} special={policy?.exigerSpecial ?? false} />
          </>
        ) : (
          <>
            <h1 className="mt-7 text-[1.8rem] leading-tight font-bold">Ce lien n'est plus valable.</h1>
            <Callout tone="warn" className="mt-4">
              Le lien est invalide, déjà utilisé ou expiré. Demandez un nouveau lien à un administrateur du restaurant.
            </Callout>
            <a href="/admin/login" className="mt-6 inline-block text-olive-deep underline underline-offset-4">
              Aller à la page de connexion
            </a>
          </>
        )}
      </Card>
    </main>
  );
}
