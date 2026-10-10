import { ArrowRight, CallBell, CheckCircle, Circle, Eye, Flag, ForkKnife, Receipt, ShieldCheck, Storefront, Users } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { Bubble, Card, PageHeader, buttonClass } from "@/components/ui";
import { cn, formatDateTime } from "@/lib/format";
import { requirePage } from "@/lib/server/auth/session";
import { ROLE_ADMIN } from "@/lib/server/schema";
import { effectiveVersion } from "@/lib/server/services/publication";
import { readDb } from "@/lib/server/storage";

export const metadata: Metadata = { title: "Vue d'ensemble" };

export default async function OverviewPage() {
  const auth = await requirePage();
  const db = await readDb();
  const resto = db.Restaurant[0];
  const visibles = db.Produits.filter((p) => p.visible);
  const tables = db.Tables.filter((t) => t.active && !t.archiveeLe);
  const version = effectiveVersion(db);

  const domains = [
    { href: "/admin/etablissement", perm: "restaurant.configurer", icon: <Storefront size={30} weight="light" />, title: "Restaurant", text: "Identité, informations, horaires et apparence générale de votre établissement.", meta: `${db.Horaires.filter((h) => h.ouvert).length} jour(s) d'ouverture` },
    { href: "/admin/produits", perm: "carte.modifier", icon: <CallBell size={30} weight="light" />, title: "Carte & images", text: "Listes et catégories, produits, options et variantes, photos et médiathèque.", meta: `${db.Produits.length} produit(s), ${db.Categories.length} catégorie(s)` },
    { href: "/admin/utilisateurs", perm: "utilisateurs.gerer", icon: <Users size={30} weight="light" />, title: "Équipe & accès", text: "Utilisateurs, rôles et permissions pour gérer l'accès à l'application.", meta: `${db.Utilisateurs.filter((u) => u.statut === "actif").length} compte(s) actif(s)` },
    { href: "/admin/tables", perm: "salle.configurer", icon: <ForkKnife size={30} weight="light" />, title: "Salle & QR", text: "Zones et tables, plan de salle et gestion des QR codes et des sessions.", meta: `${tables.length} table(s), ${db.Zones.length} zone(s)` },
    { href: "/admin/commandes", perm: "restaurant.configurer", icon: <Receipt size={30} weight="light" />, title: "Commandes & service", text: "Paramètres du panier, statuts des commandes et notifications de service.", meta: `${db.StationsPreparation.length} station(s) de préparation` },
    { href: "/admin/securite", perm: "securite.gerer", icon: <ShieldCheck size={30} weight="light" />, title: "Sécurité & données", text: "Historique, sauvegardes, connexions et paramètres de sécurité.", meta: `${db.HistoriqueActions.length} action(s) au journal` },
  ].filter((d) => auth.can(d.perm as Parameters<typeof auth.can>[0]));

  const checks = [
    { label: "Identité du restaurant", ok: !!resto?.nom && !!resto.description && !!(resto.adresse || resto.telephone), href: "/admin/etablissement", todo: "Description et coordonnées à compléter" },
    { label: "Carte à vérifier", ok: visibles.length > 0 && visibles.every((p) => p.prixCentimes > 0 && p.imageMediaId), href: "/admin/produits", todo: visibles.length === 0 ? "Aucun produit visible" : "Prix ou photos manquants" },
    { label: "Tables à configurer", ok: tables.length > 0, href: "/admin/tables", todo: "Aucune table active" },
    { label: "Droits à vérifier", ok: db.Utilisateurs.some((u) => u.statut === "actif" && u.roleId !== ROLE_ADMIN), href: "/admin/roles", todo: "Aucun membre actif en dehors des administrateurs" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Votre restaurant, à votre image."
        subtitle={`Tous les réglages de l'expérience ${resto?.nom || "Oliva"}, au même endroit.`}
        photo
        actions={
          <Link href="/admin/apercu" className={buttonClass("primary", "md", "rounded-full")}>
            <Eye size={19} /> Aperçu client
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {domains.map((d, i) => (
          <Link key={d.href} href={d.href} className="group rounded-2xl focus-visible:outline-offset-4" style={{ animationDelay: `${i * 40}ms` }}>
            <Card className="flex h-full animate-rise flex-col p-6 transition-[border-color,box-shadow] duration-200 group-hover:border-olive/40 group-hover:shadow-pop" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="flex items-start gap-5">
                <Bubble className="size-[72px]">{d.icon}</Bubble>
                <div className="min-w-0 pt-2">
                  <h2 className="text-[1.6rem] leading-tight font-semibold">{d.title}</h2>
                  <p className="mt-2.5 text-[16px] leading-relaxed text-muted">{d.text}</p>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-[16.5px] text-olive-deep">
                  Configurer <ArrowRight size={18} className="transition-transform duration-200 ease-(--ease-out) group-hover:translate-x-1" />
                </span>
                <span className="num text-[14px] text-muted">{d.meta}</span>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <section className="mt-6 grid gap-5 rounded-2xl border border-line bg-olive-soft/60 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:items-center">
        <div className="flex items-start gap-4">
          <Bubble className="bg-white">
            <Flag size={24} />
          </Bubble>
          <div>
            <h2 className="text-[1.5rem] leading-tight font-semibold">Avant publication</h2>
            <p className="mt-1 text-[15.5px] text-muted">
              {version ? `Version ${version.numero} en ligne depuis le ${formatDateTime(version.publieeLe || version.programmeePour, resto?.fuseauHoraire || undefined)}.` : "Rien n'est encore publié : le menu public affiche un message d'attente."}
            </p>
          </div>
        </div>
        <ul className="grid gap-px overflow-hidden rounded-xl bg-line sm:grid-cols-2 xl:grid-cols-4">
          {checks.map((c) => (
            <li key={c.label} className="bg-white">
              <Link href={c.href} className="flex h-full items-start gap-3 p-4 hover:bg-olive-tint">
                {c.ok ? <CheckCircle size={26} weight="fill" className="shrink-0 text-olive" /> : <Circle size={26} className="shrink-0 text-line-strong" />}
                <span>
                  <span className="block text-[15.5px] leading-tight text-ink">{c.label}</span>
                  <span className={cn("mt-1 block text-[13.5px]", c.ok ? "text-olive-deep" : "text-muted")}>{c.ok ? "Complet" : c.todo}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
