"use client";

import { Check, CircleNotch } from "@phosphor-icons/react/dist/ssr";
import { useState, type FormEvent } from "react";
import { Button, Callout, Field, Input } from "@/components/ui";

export function TokenForm({ jeton, email, invitation, min, lettreChiffre, special }: { jeton: string; email: string; invitation: boolean; min: number; lettreChiffre: boolean; special: boolean }) {
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const rules = [
    { ok: motDePasse.length >= min, label: `Au moins ${min} caractères` },
    ...(lettreChiffre ? [{ ok: /\p{L}/u.test(motDePasse) && /\d/.test(motDePasse), label: "Une lettre et un chiffre" }] : []),
    ...(special ? [{ ok: /[^\p{L}\d\s]/u.test(motDePasse), label: "Un caractère spécial" }] : []),
  ];
  const mismatch = confirmation !== "" && confirmation !== motDePasse;
  const ready = rules.every((r) => r.ok) && confirmation === motDePasse;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setPending(true);
    setError("");
    try {
      const res = await fetch("/api/admin/auth/jeton", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jeton, motDePasse }), credentials: "same-origin" });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null;
      if (res.ok && json?.ok) setDone(true);
      else setError(json?.error?.message ?? "Le mot de passe n'a pas pu être enregistré.");
    } catch {
      setError("Connexion au serveur impossible. Vérifiez votre réseau.");
    }
    setPending(false);
  };

  if (done) {
    return (
      <div className="mt-6">
        <Callout tone="olive" title={invitation ? "Votre compte est activé." : "Votre mot de passe est enregistré."}>
          Connectez-vous avec l'adresse {email}.
        </Callout>
        <a href="/admin/login" className="press mt-5 inline-flex h-12 w-full items-center justify-center rounded-[10px] bg-olive text-[17px] font-medium text-white hover:bg-olive-deep">
          Se connecter
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
      {error ? <Callout tone="danger">{error}</Callout> : null}
      <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
      <Field label="Mot de passe" htmlFor="mdp">
        <Input id="mdp" type="password" autoComplete="new-password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} className="h-12 text-[16px]" />
      </Field>
      <ul className="-mt-1 flex flex-col gap-1 text-[14.5px]">
        {rules.map((r) => (
          <li key={r.label} className={r.ok ? "flex items-center gap-2 text-olive-deep" : "flex items-center gap-2 text-muted"}>
            <Check size={15} weight="bold" className={r.ok ? "" : "opacity-30"} /> {r.label}
          </li>
        ))}
      </ul>
      <Field label="Confirmer le mot de passe" htmlFor="mdp2" error={mismatch ? "Les deux mots de passe ne correspondent pas." : undefined}>
        <Input id="mdp2" type="password" autoComplete="new-password" aria-invalid={mismatch} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className="h-12 text-[16px]" />
      </Field>
      <Button type="submit" size="lg" disabled={pending || !ready}>
        {pending ? <CircleNotch size={20} className="animate-spin" /> : null}
        {invitation ? "Accepter l'invitation" : "Enregistrer le mot de passe"}
      </Button>
    </form>
  );
}
