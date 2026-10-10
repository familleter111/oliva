import { CaretLeft, CaretRight, ClockCounterClockwise, DownloadSimple, Lock, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, Badge, Bubble, Card, EmptyState, Input, PageHeader, Select, TableWrap, Td, Th, buttonClass, type Tone } from "@/components/ui";
import { cn, formatDateTime, formatMoney } from "@/lib/format";
import { requirePage } from "@/lib/server/auth/session";
import { filterHistory } from "@/lib/server/api/routes/donnees";
import { COL_LABEL, SHEET_LABEL, type SheetName } from "@/lib/server/schema";
import { readDb } from "@/lib/server/storage";

export const metadata: Metadata = { title: "Historique" };

const PAGE = 40;
const ACTIONS: Record<string, string> = {
  creation: "Créations", modification: "Modifications", suppression: "Suppressions", ordre: "Réordonnancements", publication: "Publications", utilisateur: "Comptes", permissions: "Permissions",
  connexion: "Connexions", deconnexion: "Déconnexions", session: "Sessions du personnel", session_ouverte: "Sessions de table ouvertes", session_fermee: "Sessions de table fermées",
  import: "Imports", sauvegarde: "Sauvegardes", restauration: "Restaurations", plan: "Plan de salle", archivage: "Archivages",
};
const tone = (r: string): Tone => (r.startsWith("Appliqué") || r === "Terminé" ? "olive" : r.startsWith("En attente") || r.startsWith("Programmé") ? "warn" : "neutral");

function show(key: string, v: unknown, devise: string): string {
  if (v === null || v === undefined || v === "") return "Aucun";
  if (key === "prixCentimes") return formatMoney(v as number, devise);
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  if (Array.isArray(v)) return v.length === 0 ? "Aucun" : `${v.length} élément(s)`;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePage("historique.consulter");
  const q = await searchParams;
  const db = await readDb();
  const tz = db.Restaurant[0]?.fuseauHoraire || undefined;
  const devise = db.Restaurant[0]?.devise || "EUR";
  const filters = { periode: q.periode ?? "semaine", auteur: q.auteur ?? "", action: q.action ?? "", recherche: q.recherche ?? "" };
  const all = filterHistory(db, filters);
  const page = Math.max(1, Math.min(Math.ceil(all.length / PAGE) || 1, Number(q.page) || 1));
  const rows = all.slice((page - 1) * PAGE, page * PAGE);
  const selected = all.find((e) => e.id === q.evt) ?? rows[0];
  const authors = [...new Map(db.HistoriqueActions.filter((e) => e.auteurId).map((e) => [e.auteurId, e.auteurNom])).entries()];
  const actions = [...new Set(db.HistoriqueActions.map((e) => e.action))];

  const href = (extra: Record<string, string | number>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filters, page, ...extra })) if (v !== "" && v !== undefined) p.set(k, String(v));
    return `/admin/historique?${p.toString()}`;
  };
  const exportHref = `/api/admin/historique/export?${new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== "")).toString()}`;
  const keys = selected ? [...new Set([...Object.keys(selected.avant ?? {}), ...Object.keys(selected.apres ?? {})])] : [];

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <PageHeader eyebrow="Réglages" title="Historique des actions" subtitle="Suivez toutes les modifications et événements sur votre restaurant." />
        <div className="mb-6 flex items-center gap-4 rounded-2xl border border-line bg-olive-soft/60 px-5 py-4">
          <Bubble className="bg-white">
            <Lock size={24} />
          </Bubble>
          <div>
            <p className="text-[1.1rem] font-semibold text-ink">Journal en lecture seule</p>
            <p className="max-w-[34ch] text-[14.5px] text-muted">L'historique des actions ne peut pas être modifié ni supprimé depuis l'application.</p>
          </div>
        </div>
      </div>

      <Card className="p-4">
        <form method="get" action="/admin/historique" className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-[15px]">
            Période
            <Select name="periode" defaultValue={filters.periode}>
              <option value="jour">Dernières 24 heures</option>
              <option value="semaine">Cette semaine</option>
              <option value="mois">30 derniers jours</option>
              <option value="tout">Tout l'historique</option>
            </Select>
          </label>
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-[15px]">
            Auteur
            <Select name="auteur" defaultValue={filters.auteur}>
              <option value="">Tous</option>
              {authors.map(([id, nom]) => (
                <option key={id} value={id}>
                  {nom}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-[15px]">
            Action
            <Select name="action" defaultValue={filters.action}>
              <option value="">Toutes</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {ACTIONS[a] ?? a}
                </option>
              ))}
            </Select>
          </label>
          <label className="relative flex min-w-52 flex-[2] flex-col gap-1 text-[15px]">
            Recherche
            <MagnifyingGlass size={18} aria-hidden className="pointer-events-none absolute bottom-[11px] left-3 text-muted" />
            <Input type="search" name="recherche" defaultValue={filters.recherche} maxLength={80} placeholder="Un élément, une action" className="pl-10" />
          </label>
          <button type="submit" className={buttonClass("primary")}>
            Filtrer
          </button>
          <a href={exportHref} className={buttonClass("secondary")}>
            <DownloadSimple size={18} /> Exporter en CSV
          </a>
        </form>
      </Card>

      <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState icon={<ClockCounterClockwise size={24} />} title="Aucune action sur cette période">
              Élargissez la période ou retirez un filtre.
            </EmptyState>
          ) : (
            <TableWrap className="rounded-none border-0">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr>
                    <Th>Date et heure</Th>
                    <Th>Auteur</Th>
                    <Th>Action</Th>
                    <Th>Élément</Th>
                    <Th>Résultat</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id} className={cn("relative transition-colors hover:bg-olive-tint", selected?.id === e.id && "bg-olive-soft/60")}>
                      <Td className="num whitespace-nowrap">
                        <Link href={href({ evt: e.id })} scroll={false} aria-label={`Détail : ${e.libelle}`} className="after:absolute after:inset-0">
                          {formatDateTime(e.date, tz)}
                        </Link>
                      </Td>
                      <Td>
                        <span className="flex items-center gap-2">
                          <Avatar name={e.auteurNom} className="size-8 text-[13px]" /> {e.auteurNom}
                        </span>
                      </Td>
                      <Td className="text-ink">{e.libelle}</Td>
                      <Td className="text-muted">{e.entiteNom || (e.entite ? SHEET_LABEL[e.entite as SheetName] : "")}</Td>
                      <Td>
                        <Badge tone={tone(e.resultat)} dot>
                          {e.resultat}
                        </Badge>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
          <div className="num flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-[14.5px] text-muted">
            <span>
              {all.length} action{all.length > 1 ? "s" : ""}, page {page} sur {Math.ceil(all.length / PAGE) || 1}
            </span>
            <span className="flex gap-1">
              <Link href={href({ page: page - 1 })} aria-disabled={page <= 1} aria-label="Page précédente" className={cn(buttonClass("secondary", "sm"), page <= 1 && "pointer-events-none opacity-40")}>
                <CaretLeft size={16} />
              </Link>
              <Link href={href({ page: page + 1 })} aria-disabled={page * PAGE >= all.length} aria-label="Page suivante" className={cn(buttonClass("secondary", "sm"), page * PAGE >= all.length && "pointer-events-none opacity-40")}>
                <CaretRight size={16} />
              </Link>
            </span>
          </div>
        </Card>

        {selected ? (
          <Card className="h-fit p-5 sm:p-6 scroll-thin xl:sticky xl:top-[72px] xl:max-h-[calc(100dvh-88px)] xl:overflow-y-auto">
            <h2 className="text-[1.35rem] font-semibold">Détail de l'action</h2>
            <p className="num font-sans text-[13px] text-muted">Événement {selected.id}</p>
            <p className="num text-[14.5px] text-muted">{formatDateTime(selected.date, tz)}</p>
            <dl className="mt-4 flex flex-col gap-3 border-t border-line pt-4 text-[15px]">
              <div className="grid grid-cols-[84px_1fr] gap-2">
                <dt className="text-muted">Auteur</dt>
                <dd className="text-ink">{selected.auteurNom}</dd>
              </div>
              <div className="grid grid-cols-[84px_1fr] gap-2">
                <dt className="text-muted">Action</dt>
                <dd className="text-ink">{selected.libelle}</dd>
              </div>
              <div className="grid grid-cols-[84px_1fr] gap-2">
                <dt className="text-muted">Élément</dt>
                <dd>
                  <span className="block text-ink">{selected.entiteNom || "Aucun"}</span>
                  <span className="block text-[13.5px] text-muted">{selected.entite ? SHEET_LABEL[selected.entite as SheetName] : ""}</span>
                </dd>
              </div>
              <div className="grid grid-cols-[84px_1fr] gap-2">
                <dt className="text-muted">Résultat</dt>
                <dd>{selected.resultat}</dd>
              </div>
            </dl>
            <div className="mt-4 border-t border-line pt-4">
              <p className="text-[15px] text-muted">Valeurs</p>
              {keys.length === 0 ? (
                <p className="mt-1 text-[14.5px] text-muted">Aucune valeur détaillée pour cette action.</p>
              ) : (
                <table className="mt-2 w-full text-[14.5px]">
                  <thead>
                    <tr className="text-left text-muted">
                      <th className="py-1 pr-2 font-normal">Champ</th>
                      <th className="py-1 pr-2 font-normal">Avant</th>
                      <th className="py-1 font-normal">Après</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((k) => (
                      <tr key={k} className="border-t border-line align-top">
                        <th scope="row" className="py-1.5 pr-2 text-left font-normal text-ink">
                          {COL_LABEL[k] ?? k}
                        </th>
                        <td className="num max-w-32 py-1.5 pr-2 break-words text-muted">{selected.avant ? show(k, selected.avant[k], devise) : ""}</td>
                        <td className="num max-w-32 py-1.5 break-words text-ink">{selected.apres ? show(k, selected.apres[k], devise) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}
