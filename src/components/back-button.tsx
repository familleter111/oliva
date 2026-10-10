"use client";

import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/format";

/**
 * Retour à la page précédente. Sans page précédente dans l'onglet (lien ouvert directement),
 * le bouton mène à `fallback`, ou disparaît si `hideWithoutHistory` est activé.
 */
export function BackButton({ fallback = "/", floating, hideWithoutHistory, className }: { fallback?: string; floating?: boolean; hideWithoutHistory?: boolean; className?: string }) {
  const router = useRouter();
  const [hasHistory, setHasHistory] = useState(!hideWithoutHistory);
  useEffect(() => setHasHistory(window.history.length > 1), []);
  if (hideWithoutHistory && !hasHistory) return null;
  return (
    <button
      type="button"
      aria-label="Retour à la page précédente"
      title="Retour à la page précédente"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
      className={cn(
        "press inline-grid size-9 shrink-0 place-items-center rounded-[10px] hover:bg-black/5",
        floating && "no-print fixed top-4 left-4 z-40 rounded-full border border-line bg-white shadow-card hover:bg-olive-tint",
        className,
      )}
    >
      <ArrowLeft size={20} aria-hidden />
    </button>
  );
}
