"use client";

import { CallBell, ChatCircleDots, House, PicnicTable, Receipt, UsersThree } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";
import type { AccountUser, PasswordPolicy } from "../account";
import { StaffShell, type StaffNavEntry } from "../staff/shell";

export { Crumb } from "../staff/shell";

/** Cadre de l'espace responsable de salle : six rubriques pour coordonner le service. */
export function ChefShell({
  csrf,
  user,
  brand,
  politique,
  counts,
  etat,
  children,
}: {
  csrf: string;
  user: AccountUser;
  brand: { nom: string; sousTitre: string; logo: string | null };
  politique: PasswordPolicy;
  counts: { demandes: number; aServir: number; arrivees: number };
  etat: string;
  children: ReactNode;
}) {
  const nav: StaffNavEntry[] = [
    { href: "/responsable", label: "Vue d'ensemble", court: "Ensemble", icon: House },
    { href: "/responsable/plan", label: "Plan de salle", court: "Plan", icon: PicnicTable },
    { href: "/responsable/equipe", label: "Équipe & affectations", court: "Équipe", icon: UsersThree },
    { href: "/responsable/service", label: "Suivi du service", court: "Service", icon: CallBell, badge: counts.aServir },
    { href: "/responsable/demandes", label: "Demandes clients", court: "Demandes", icon: ChatCircleDots, badge: counts.demandes + counts.arrivees },
    { href: "/responsable/sessions", label: "Sessions de table", court: "Sessions", icon: Receipt },
  ];
  return (
    <StaffShell csrf={csrf} user={user} brand={brand} politique={politique} espace="responsable" titre="Espace responsable de salle" racine="/responsable" nav={nav} etat={etat}>
      {children}
    </StaffShell>
  );
}
