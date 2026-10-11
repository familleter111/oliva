"use client";

import { ChefHat } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";
import type { AccountUser, PasswordPolicy } from "../account";
import { StaffShell, type StaffNavEntry } from "../staff/shell";

export { Crumb } from "../staff/shell";

/** Cadre de l'écran de cuisine : une seule rubrique, le travail du moment. */
export function CuisineShell({
  csrf,
  user,
  brand,
  politique,
  aPreparer,
  children,
}: {
  csrf: string;
  user: AccountUser;
  brand: { nom: string; sousTitre: string; logo: string | null };
  politique: PasswordPolicy;
  aPreparer: number;
  children: ReactNode;
}) {
  const nav: StaffNavEntry[] = [{ href: "/cuisine", label: "À préparer", court: "À préparer", icon: ChefHat, badge: aPreparer }];
  return (
    <StaffShell csrf={csrf} user={user} brand={brand} politique={politique} espace="cuisine" titre="Cuisine" racine="/cuisine" nav={nav}>
      {children}
    </StaffShell>
  );
}
