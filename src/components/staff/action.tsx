"use client";

import { CircleNotch } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";
import { useAction, useApi } from "../client";
import { buttonClass } from "../ui";

export type Variante = "primary" | "secondary" | "outline";

/**
 * Bouton d'action des espaces du personnel. L'API appelée revérifie la session, la permission
 * et la portée du rôle avant d'écrire. Le message de réussite n'apparaît qu'après la réponse
 * du serveur, et la page est redemandée pour afficher l'état enregistré.
 */
export function StaffAction({
  espace,
  path,
  label,
  success,
  icon,
  body,
  variant = "primary",
  size = "md",
  className,
  disabled,
}: {
  espace: "salle" | "cuisine";
  path: string;
  label: string;
  success: string;
  icon?: ReactNode;
  /** Corps de la requête, pour les actions qui portent un choix, comme l'étape visée. */
  body?: unknown;
  variant?: Variante;
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
}) {
  const call = useApi(espace);
  const { run, pending } = useAction();
  return (
    <button type="button" disabled={pending || disabled} onClick={() => void run(() => call("POST", path, body), { success })} className={buttonClass(variant, size, className)}>
      {pending ? <CircleNotch size={18} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}
