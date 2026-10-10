import { ArrowsLeftRight, ShoppingBag } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { cn } from "@/lib/format";

/** Navigation entre les deux écrans de la rubrique Commandes. */
export function CommandesNav({ active }: { active: "panier" | "statuts" }) {
  const item = (href: string, id: string, label: string, icon: React.ReactNode) => (
    <Link
      href={href}
      aria-current={active === id ? "page" : undefined}
      className={cn("-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-[16px] whitespace-nowrap transition-colors", active === id ? "border-olive font-medium text-ink" : "border-transparent text-muted hover:text-text")}
    >
      {icon}
      {label}
    </Link>
  );
  return (
    <nav aria-label="Commandes" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {item("/admin/commandes", "panier", "Panier partagé", <ShoppingBag size={19} />)}
      {item("/admin/commandes/statuts", "statuts", "Statuts & préparation", <ArrowsLeftRight size={19} />)}
    </nav>
  );
}
