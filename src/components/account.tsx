"use client";

import { ArrowSquareOut, CaretDown, Key, SignOut } from "@phosphor-icons/react/dist/ssr";
import { DropdownMenu } from "radix-ui";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError, Modal, useApi } from "./client";
import { Avatar, Button, Field, Input } from "./ui";

/** Menu du compte connecté, partagé par l'administration et l'espace serveur. */

export interface AccountUser {
  nom: string;
  role: string;
}
export interface PasswordPolicy {
  min: number;
  lettreChiffre: boolean;
  special: boolean;
}

function PasswordDialog({ open, onClose, politique }: { open: boolean; onClose: () => void; politique: PasswordPolicy }) {
  const call = useApi();
  const [actuel, setActuel] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mismatch = confirmation !== "" && confirmation !== nouveau;
  const rules = [`${politique.min} caractères minimum`, ...(politique.lettreChiffre ? ["une lettre et un chiffre"] : []), ...(politique.special ? ["un caractère spécial"] : [])];

  const close = () => {
    setActuel("");
    setNouveau("");
    setConfirmation("");
    setErrors({});
    onClose();
  };
  const submit = async () => {
    setPending(true);
    setErrors({});
    try {
      await call("PUT", "compte/mot-de-passe", { actuel, nouveau });
      toast.success("Mot de passe modifié. Vos autres sessions ont été déconnectées.");
      close();
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError("Le mot de passe n'a pas pu être modifié.");
      setErrors(Object.keys(err.details).length > 0 ? err.details : { nouveau: err.message });
    }
    setPending(false);
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Changer mon mot de passe"
      description={`Règles en vigueur : ${rules.join(", ")}.`}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Annuler
          </Button>
          <Button disabled={pending || !actuel || !nouveau || confirmation !== nouveau} onClick={submit}>
            Enregistrer
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (actuel && nouveau && confirmation === nouveau) void submit();
        }}
      >
        <Field label="Mot de passe actuel" htmlFor="mdp-actuel" error={errors.actuel}>
          <Input id="mdp-actuel" type="password" autoComplete="current-password" value={actuel} aria-invalid={!!errors.actuel} onChange={(e) => setActuel(e.target.value)} />
        </Field>
        <Field label="Nouveau mot de passe" htmlFor="mdp-nouveau" error={errors.nouveau}>
          <Input id="mdp-nouveau" type="password" autoComplete="new-password" value={nouveau} aria-invalid={!!errors.nouveau} onChange={(e) => setNouveau(e.target.value)} />
        </Field>
        <Field label="Confirmer le nouveau mot de passe" htmlFor="mdp-confirmation" error={mismatch ? "Les deux mots de passe ne correspondent pas." : undefined}>
          <Input id="mdp-confirmation" type="password" autoComplete="new-password" value={confirmation} aria-invalid={mismatch} onChange={(e) => setConfirmation(e.target.value)} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function AccountMenu({ user, politique }: { user: AccountUser; politique: PasswordPolicy }) {
  const call = useApi();
  const [changing, setChanging] = useState(false);
  const logout = async () => {
    try {
      await call("POST", "auth/logout");
    } finally {
      window.location.assign("/admin/login");
    }
  };
  const item = "flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[15px] outline-none data-[highlighted]:bg-olive-soft";
  return (
    <>
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger aria-label={`${user.nom} · ${user.role}, menu du compte`} className="press flex shrink-0 items-center gap-2.5 rounded-full py-1 pr-2 pl-1 hover:bg-olive-tint">
        <Avatar name={user.nom} className="size-9" />
        <span className="hidden text-[15px] text-text xl:inline">
          {user.nom} <span className="text-muted">· {user.role}</span>
        </span>
        <CaretDown size={14} aria-hidden className="text-muted" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="z-50 min-w-56 origin-(--radix-dropdown-menu-content-transform-origin) animate-pop rounded-xl border border-line bg-white p-1.5 shadow-pop">
          <div className="px-3 py-2 xl:hidden">
            <p className="text-[15px] font-medium text-ink">{user.nom}</p>
            <p className="text-[13.5px] text-muted">{user.role}</p>
          </div>
          <DropdownMenu.Item asChild>
            <a href="/" target="_blank" rel="noreferrer" className={item}>
              <ArrowSquareOut size={18} /> Ouvrir le menu public
            </a>
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => setChanging(true)} className={item}>
            <Key size={18} /> Changer mon mot de passe
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={logout} className={item}>
            <SignOut size={18} /> Se déconnecter
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
    <PasswordDialog open={changing} onClose={() => setChanging(false)} politique={politique} />
    </>
  );
}
