"use client";

import { CircleNotch, SignIn } from "@phosphor-icons/react/dist/ssr";
import { useState, type FormEvent } from "react";
import { Button, Callout, Field, Input } from "@/components/ui";

export function LoginForm() {
  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      const res = await fetch("/api/admin/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifiant, motDePasse }), credentials: "same-origin" });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: { redirection?: string }; error?: { message?: string } } | null;
      if (res.ok && json?.ok) {
        // La destination vient du serveur : elle dépend des permissions du compte, pas du formulaire.
        const vers = json.data?.redirection ?? "";
        window.location.assign(["/salle", "/responsable", "/cuisine", "/admin/acces-refuse"].includes(vers) ? vers : "/admin");
        return;
      }
      setError(json?.error?.message ?? "Connexion impossible pour le moment. Réessayez.");
    } catch {
      setError("Connexion au serveur impossible. Vérifiez votre réseau.");
    }
    setPending(false);
  };

  return (
    <form onSubmit={submit} className="mt-8 flex flex-col gap-5" noValidate>
      {error ? <Callout tone="danger">{error}</Callout> : null}
      <Field label="Identifiant ou e-mail" htmlFor="identifiant">
        <Input id="identifiant" name="identifiant" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} className="h-12 text-[16px]" />
      </Field>
      <Field label="Mot de passe" htmlFor="motDePasse">
        <Input id="motDePasse" name="motDePasse" type="password" autoComplete="current-password" required value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} className="h-12 text-[16px]" />
      </Field>
      <Button type="submit" size="lg" disabled={pending || !identifiant || !motDePasse}>
        {pending ? <CircleNotch size={20} className="animate-spin" /> : <SignIn size={20} />}
        Se connecter
      </Button>
    </form>
  );
}
