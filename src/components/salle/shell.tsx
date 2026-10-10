"use client";

import { CallBell, ChatCircleDots, PicnicTable, Receipt } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";
import type { SalleCounts } from "@/lib/salle-types";
import type { AccountUser, PasswordPolicy } from "../account";
import { StaffShell, type StaffNavEntry } from "../staff/shell";

export { Crumb } from "../staff/shell";

/** Cadre de l'espace serveur : quatre rubriques, pastilles calculées sur le serveur. */
export function SalleShell({
  csrf,
  user,
  brand,
  counts,
  politique,
  children,
}: {
  csrf: string;
  user: AccountUser;
  brand: { nom: string; sousTitre: string; logo: string | null };
  counts: SalleCounts;
  politique: PasswordPolicy;
  children: ReactNode;
}) {
  const nav: StaffNavEntry[] = [
    { href: "/salle", label: "Mes tables", court: "Mes tables", icon: PicnicTable, aussi: ["/salle/tables"] },
    { href: "/salle/servir", label: "À servir", court: "À servir", icon: CallBell, badge: counts.aServir },
    { href: "/salle/demandes", label: "Demandes clients", court: "Demandes", icon: ChatCircleDots, badge: counts.demandes },
    { href: "/salle/additions", label: "Additions", court: "Additions", icon: Receipt, badge: counts.additions },
  ];
  return (
    <StaffShell csrf={csrf} user={user} brand={brand} politique={politique} espace="salle" titre="Espace serveur" racine="/salle" nav={nav}>
      {children}
    </StaffShell>
  );
}
