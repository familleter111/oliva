import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { LanguageSwitch } from "@/components/i18n";
import { Wordmark } from "@/components/ui";
import { currentAuth, homeFor } from "@/lib/server/auth/session";
import { LoginForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connexion", robots: { index: false, follow: false } };

export default async function LoginPage() {
  const auth = await currentAuth();
  if (auth) redirect(homeFor(auth));
  return (
    <main className="grid min-h-[100dvh] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <BackButton floating fallback="/" />
      <LanguageSwitch floating />
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-20">
        <div className="mx-auto w-full max-w-[400px] animate-rise">
          <Wordmark subtitle="Administration" />
          <h1 className="mt-10 text-[2.2rem] leading-tight font-bold tracking-[-0.02em]">Connexion du personnel</h1>
          <p className="mt-2 text-[1.1rem] text-muted">Accédez à la configuration de votre restaurant.</p>
          <LoginForm />
          <p className="mt-8 text-[14.5px] text-muted">Les comptes sont créés sur invitation par un administrateur. Les clients consultent la carte sans compte.</p>
        </div>
      </div>
      <div aria-hidden className="relative hidden bg-cover bg-center lg:block" style={{ backgroundImage: "url(/brand/salle.webp)" }}>
        <div className="absolute inset-0 bg-gradient-to-t from-ink/55 via-ink/10 to-transparent" />
      </div>
    </main>
  );
}
