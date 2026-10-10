"use client";

import { ArrowCounterClockwise, Check, CheckCircle, CircleNotch, Database, DownloadSimple, File, HardDrives, Info, Lock, Trash, UploadSimple, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { useRef, useState } from "react";
import { ApiError, Confirm, Modal, Tabs, useAction, useApi } from "@/components/client";
import { Badge, Bubble, Button, Callout, Card, Checkbox, EmptyState, Field, Input, PageHeader, Select, TableWrap, Td, Th } from "@/components/ui";
import { cn, formatBytes, formatDateTime } from "@/lib/format";

interface ImportLine {
  n: number;
  cells: Record<string, string>;
  action: "creation" | "mise_a_jour";
  erreurs: string[];
}
interface Preview {
  type: string;
  colonnes: { key: string; label: string }[];
  colonnesManquantes: string[];
  lignes: ImportLine[];
  valides: number;
  aCorriger: number;
}
interface Backup {
  id: string;
  creeLe: string;
  auteur: string;
  note: string;
  revision: number;
  demo: boolean;
  tailleOctets: number;
  medias: number;
  lignes: Record<string, number>;
}
interface Restore {
  id: string;
  revision: number;
  comparaison: { element: string; actuel: number; sauvegarde: number }[];
  conserve: string[];
  blocages: string[];
}
interface Props {
  imports: { type: string; label: string; colonnes: { label: string; obligatoire: boolean }[] }[];
  exports: { type: string; label: string; colonnes: { key: string; label: string }[] }[];
  sauvegardes: { manuelles: Backup[]; automatiques: number; derniereAuto: string };
  stockage: { revision: number; majLe: string; tailleOctets: number; lignes: number; historique: number; demo: boolean };
  fuseau: string;
}

function Step({ n, label, sub, state }: { n: number; label: string; sub: string; state: "done" | "current" | "todo" }) {
  return (
    <li className="flex items-center gap-3">
      <span className={cn("num grid size-10 shrink-0 place-items-center rounded-full text-[16px] font-semibold", state === "todo" ? "border border-line-strong text-muted" : "bg-olive text-white")}>{state === "done" ? <Check size={18} weight="bold" /> : n}</span>
      <span>
        <span className={cn("block text-[15.5px]", state === "todo" ? "text-muted" : "text-ink")}>{label}</span>
        <span className="block text-[13px] text-muted">{sub}</span>
      </span>
    </li>
  );
}

function ImportPanel({ imports }: { imports: Props["imports"] }) {
  const call = useApi();
  const { run, pending } = useAction();
  const [type, setType] = useState(imports[0]?.type ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ lignes: number; creations: number; misesAJour: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const def = imports.find((i) => i.type === type);

  const body = (f: File) => {
    const form = new FormData();
    form.set("fichier", f);
    form.set("type", type);
    return form;
  };
  const analyse = async (f: File | undefined) => {
    setError("");
    setDone(null);
    setPreview(null);
    setFile(f ?? null);
    if (!f) return;
    try {
      setPreview(await call<Preview>("POST", "import/apercu", body(f)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Le fichier n'a pas pu être analysé.");
    }
  };
  const apply = async () => {
    if (!file) return;
    const out = await run(() => call<{ lignes: number; creations: number; misesAJour: number }>("POST", "import/appliquer", body(file)), { success: "Import terminé." });
    if (out) {
      setDone(out);
      setPreview(null);
      setFile(null);
      if (input.current) input.current.value = "";
    }
  };
  const report = () => {
    if (!preview) return;
    const lines = [["Ligne", ...preview.colonnes.map((c) => c.label), "Problèmes"], ...preview.lignes.filter((l) => l.erreurs.length > 0).map((l) => [String(l.n + 1), ...preview.colonnes.map((c) => l.cells[c.key] ?? ""), l.erreurs.join(" / ")])];
    const csv = `﻿${lines.map((r) => r.map((c) => `"${(/^[=+\-@]/.test(c) ? `'${c}` : c).replace(/"/g, '""')}"`).join(";")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapport-import-${type}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const blocked = !!preview && (preview.aCorriger > 0 || preview.colonnesManquantes.length > 0);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-[1.35rem] font-semibold">Import de données</h2>
        <p className="text-[15px] text-muted">Importez vos produits, catégories ou tables depuis un fichier CSV ou Excel. Rien n'est écrit avant votre confirmation.</p>
      </div>
      <ol className="flex flex-wrap gap-x-8 gap-y-3">
        <Step n={1} label="Fichier" sub={file ? "Fichier choisi" : "À choisir"} state={file ? "done" : "current"} />
        <Step n={2} label="Vérification" sub="Contrôle des données" state={done ? "done" : preview ? "current" : "todo"} />
        <Step n={3} label="Confirmation" sub="Import des données" state={done ? "done" : "todo"} />
      </ol>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Field label="Type de données" htmlFor="imp-type">
          <Select
            id="imp-type"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPreview(null);
              setFile(null);
              setDone(null);
              if (input.current) input.current.value = "";
            }}
          >
            {imports.map((i) => (
              <option key={i.type} value={i.type}>
                {i.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fichier CSV ou Excel (2 Mo maximum)" htmlFor="imp-file" help={`Colonnes attendues : ${def?.colonnes.map((c) => (c.obligatoire ? `${c.label} (obligatoire)` : c.label)).join(", ")}.`}>
          <input ref={input} id="imp-file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => analyse(e.target.files?.[0])} className="block w-full rounded-[10px] border border-line-strong bg-white text-[15px] file:mr-3 file:h-10 file:cursor-pointer file:border-0 file:bg-olive-soft file:px-4 file:text-[15px] file:text-ink" />
        </Field>
      </div>

      {error ? <Callout tone="danger">{error}</Callout> : null}
      {done ? (
        <Callout tone="olive" title="Import enregistré">
          {done.lignes} ligne(s) traitée(s) : {done.creations} création(s), {done.misesAJour} mise(s) à jour. Les changements apparaîtront sur le menu après publication.
        </Callout>
      ) : null}

      {preview ? (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3">
            <Bubble className="size-10">
              <File size={20} />
            </Bubble>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[16px] font-medium text-ink">{file?.name}</p>
              <p className="num text-[14px] text-muted">
                {preview.lignes.length} ligne(s) détectée(s), {preview.aCorriger} à corriger
              </p>
            </div>
          </div>
          {preview.colonnesManquantes.length > 0 ? <Callout tone="danger" title="Colonnes obligatoires absentes">{preview.colonnesManquantes.join(", ")}</Callout> : null}
          <TableWrap>
            <table className="w-full min-w-[560px]">
              <thead>
                <tr>
                  <Th className="w-12">#</Th>
                  {preview.colonnes.slice(0, 4).map((c) => (
                    <Th key={c.key}>{c.label}</Th>
                  ))}
                  <Th>Résultat</Th>
                </tr>
              </thead>
              <tbody>
                {preview.lignes.slice(0, 50).map((l) => (
                  <tr key={l.n}>
                    <Td className="num text-muted">{l.n}</Td>
                    {preview.colonnes.slice(0, 4).map((c) => (
                      <Td key={c.key} className="max-w-44 truncate">
                        {l.cells[c.key] || <span className="text-muted">Vide</span>}
                      </Td>
                    ))}
                    <Td>
                      {l.erreurs.length === 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-olive-deep">
                          <CheckCircle size={18} weight="fill" /> {l.action === "creation" ? "Valide, création" : "Valide, mise à jour"}
                        </span>
                      ) : (
                        <span className="inline-flex items-start gap-1.5 text-danger">
                          <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" /> {l.erreurs.join(", ")}
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          {preview.lignes.length > 50 ? <p className="text-[13.5px] text-muted">Aperçu limité aux 50 premières lignes. Le contrôle porte sur toutes les lignes.</p> : null}
          <Callout tone={blocked ? "danger" : "olive"} title={`${preview.valides} ligne(s) valide(s), ${preview.aCorriger} à corriger`}>
            {blocked ? "Corrigez le fichier puis choisissez-le de nouveau. Aucune donnée n'est importée tant qu'une ligne est en erreur." : "Toutes les lignes sont valides. L'import s'applique d'un bloc."}
          </Callout>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="secondary" disabled={preview.aCorriger === 0} onClick={report}>
              <DownloadSimple size={18} /> Télécharger le rapport d'erreurs
            </Button>
            <Button size="lg" disabled={blocked || pending} onClick={apply}>
              {pending ? <CircleNotch size={20} className="animate-spin" /> : <UploadSimple size={20} />}
              {blocked ? "Corriger avant d'importer" : `Importer ${preview.lignes.length} ligne(s)`}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ExportPanel({ exports }: { exports: Props["exports"] }) {
  const [choice, setChoice] = useState<Record<string, string[]>>({});
  const [open, setOpen] = useState("");
  const def = exports.find((e) => e.type === open);
  const cols = (type: string) => choice[type] ?? exports.find((e) => e.type === type)!.colonnes.map((c) => c.key);
  const href = (type: string, format: string) => `/api/admin/export/${type}?format=${format}&colonnes=${cols(type).join(",")}`;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-[1.35rem] font-semibold">Export de données</h2>
        <p className="text-[15px] text-muted">Générez un fichier Excel ou CSV. Les textes y sont écrits comme du texte : aucune formule n'est interprétée.</p>
      </div>
      <ul className="flex flex-col gap-3">
        {exports.map((e) => (
          <li key={e.type} className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3">
            <Bubble className="size-11">
              <Database size={20} />
            </Bubble>
            <div className="min-w-36 flex-1">
              <p className="text-[16.5px] font-medium text-ink">{e.label}</p>
              <p className="num text-[14px] text-muted">
                {cols(e.type).length} colonne(s) sur {e.colonnes.length}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setOpen(e.type)}>
              Choisir les colonnes
            </Button>
            <a href={href(e.type, "xlsx")} className="press inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-olive px-3 text-[14px] font-medium text-white hover:bg-olive-deep">
              <DownloadSimple size={16} /> Excel
            </a>
            <a href={href(e.type, "csv")} className="press inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-olive/70 bg-white px-3 text-[14px] font-medium text-olive-deep hover:bg-olive-tint">
              <DownloadSimple size={16} /> CSV
            </a>
          </li>
        ))}
      </ul>
      <Callout tone="warn" title="Données confidentielles">
        L'accès aux exports et aux sauvegardes est réservé aux rôles autorisés. Les mots de passe ne sont jamais exportés.
      </Callout>
      <Modal open={!!def} onClose={() => setOpen("")} title={`Colonnes de l'export ${def?.label ?? ""}`} footer={<Button onClick={() => setOpen("")}>Terminé</Button>}>
        <div className="flex flex-col gap-2.5">
          {def?.colonnes.map((c) => {
            const current = cols(def.type);
            return (
              <Checkbox key={c.key} checked={current.includes(c.key)} disabled={current.length === 1 && current.includes(c.key)} onChange={(e) => setChoice({ ...choice, [def.type]: e.target.checked ? def.colonnes.map((x) => x.key).filter((k) => current.includes(k) || k === c.key) : current.filter((k) => k !== c.key) })}>
                {c.label}
              </Checkbox>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}

function BackupPanel({ sauvegardes, fuseau }: { sauvegardes: Props["sauvegardes"]; fuseau: string }) {
  const call = useApi();
  const { run, pending } = useAction();
  const [note, setNote] = useState("");
  const [restore, setRestore] = useState<Restore | null>(null);
  const [word, setWord] = useState("");
  const [deleting, setDeleting] = useState<Backup | null>(null);
  const tz = fuseau || undefined;

  const prepare = async (id: string) => {
    const out = await run(() => call<Restore>("GET", `sauvegardes/${id}/apercu`), { refresh: false });
    if (out) {
      setRestore(out);
      setWord("");
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-[1.35rem] font-semibold">Sauvegardes</h2>
        <p className="text-[15px] text-muted">Une sauvegarde contient le classeur de données et les images. Elle reste sur le disque du serveur.</p>
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => call("POST", "sauvegardes", { note }), { success: "Sauvegarde créée." })) setNote("");
        }}
      >
        <Input aria-label="Note de la sauvegarde" placeholder="Note, par exemple Avant la carte d'hiver" maxLength={80} value={note} onChange={(e) => setNote(e.target.value)} className="min-w-52 flex-1" />
        <Button type="submit" disabled={pending}>
          {pending ? <CircleNotch size={18} className="animate-spin" /> : <HardDrives size={18} />} Créer une sauvegarde
        </Button>
      </form>
      {sauvegardes.manuelles.length === 0 ? (
        <EmptyState icon={<HardDrives size={24} />} title="Aucune sauvegarde manuelle">
          Créez-en une avant un import ou un changement important de la carte.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {sauvegardes.manuelles.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3">
              <Bubble className="size-11">
                <Database size={20} />
              </Bubble>
              <div className="min-w-44 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[16px] font-medium text-ink">
                  {b.note || "Sauvegarde manuelle"} {b.demo ? <Badge>Données de démonstration</Badge> : null}
                </p>
                <p className="num text-[14px] text-muted">
                  {formatDateTime(b.creeLe, tz)}, par {b.auteur}
                </p>
                <p className="num text-[13.5px] text-muted">
                  {Object.entries(b.lignes).map(([k, v]) => `${v} ${k.toLowerCase()}`).slice(0, 4).join(", ")}, {b.medias / 2} image(s), {formatBytes(b.tailleOctets)}
                </p>
              </div>
              <a href={`/api/admin/sauvegardes/${b.id}/fichier`} className="press inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-line-strong bg-white px-3 text-[14px] hover:bg-olive-tint">
                <DownloadSimple size={16} /> Classeur
              </a>
              <Button variant="outline" size="sm" disabled={pending} onClick={() => prepare(b.id)}>
                <ArrowCounterClockwise size={16} /> Préparer une restauration
              </Button>
              <Button variant="ghost" size="sm" aria-label="Supprimer cette sauvegarde" disabled={pending} onClick={() => setDeleting(b)}>
                <Trash size={17} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="num flex items-center gap-2 text-[14px] text-muted">
        <Info size={18} aria-hidden />
        {sauvegardes.automatiques > 0 ? `${sauvegardes.automatiques} copie(s) automatique(s) du classeur, la dernière le ${formatDateTime(sauvegardes.derniereAuto, tz)}.` : "Une copie automatique du classeur est prise au plus une fois par heure, avant une écriture."}
      </p>
      <Callout tone="info" title="Restauration soumise à vérification">
        Restaurer une sauvegarde remplace les cartes, les produits, les utilisateurs et les paramètres. Les commandes déjà enregistrées et l'historique sont conservés.
      </Callout>

      <Modal
        open={!!restore}
        onClose={() => setRestore(null)}
        title="Restaurer cette sauvegarde"
        description="La sauvegarde a été relue et validée. Vérifiez ce qui va changer."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRestore(null)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              disabled={pending || word.trim().toUpperCase() !== "RESTAURER" || (restore?.blocages.length ?? 0) > 0}
              onClick={async () => {
                if (restore && (await run(() => call("POST", `sauvegardes/${restore.id}/restaurer`, { confirmation: word }), { success: "Sauvegarde restaurée." }))) setRestore(null);
              }}
            >
              {pending ? <CircleNotch size={18} className="animate-spin" /> : null} Restaurer
            </Button>
          </>
        }
      >
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <Th>Élément</Th>
                <Th>Actuellement</Th>
                <Th>Dans la sauvegarde</Th>
              </tr>
            </thead>
            <tbody>
              {restore?.comparaison.map((c) => (
                <tr key={c.element}>
                  <Td>{c.element}</Td>
                  <Td className="num">{c.actuel}</Td>
                  <Td className={cn("num", c.actuel !== c.sauvegarde && "font-semibold text-ink")}>{c.sauvegarde}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        <p className="mt-3 text-[14.5px] text-muted">Conservé : {restore?.conserve.join(", ")}. Une sauvegarde de sécurité de l'état actuel est créée juste avant.</p>
        {restore?.blocages.map((b) => (
          <Callout key={b} tone="danger" className="mt-3">
            {b}
          </Callout>
        ))}
        {restore && restore.blocages.length === 0 ? (
          <Field label="Saisissez RESTAURER pour confirmer" htmlFor="rest-word" className="mt-4">
            <Input id="rest-word" autoComplete="off" value={word} onChange={(e) => setWord(e.target.value)} />
          </Field>
        ) : null}
      </Modal>

      <Confirm
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Supprimer cette sauvegarde ?"
        danger
        confirmLabel="Supprimer"
        pending={pending}
        onConfirm={async () => {
          if (deleting) await run(() => call("DELETE", `sauvegardes/${deleting.id}`), { success: "Sauvegarde supprimée." });
          setDeleting(null);
        }}
      >
        La sauvegarde du {deleting ? formatDateTime(deleting.creeLe, tz) : ""} sera effacée du disque. Cette suppression est définitive.
      </Confirm>
    </div>
  );
}

export function DonneesEditor({ imports, exports, sauvegardes, stockage, fuseau }: Props) {
  const [tab, setTab] = useState("importer");
  return (
    <>
      <PageHeader eyebrow="Données" title="Données & sauvegardes" subtitle="Importer, exporter et sécuriser les données de votre restaurant." photo />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <Card className="p-5 sm:p-6">
          <Tabs
            label="Données"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "importer", label: "Importer", icon: <UploadSimple size={19} /> },
              { id: "exporter", label: "Exporter", icon: <DownloadSimple size={19} /> },
              { id: "sauvegardes", label: "Sauvegardes", icon: <Database size={19} /> },
            ]}
          />
          <div className="mt-5">
            {tab === "importer" ? <ImportPanel imports={imports} /> : null}
            {tab === "exporter" ? <ExportPanel exports={exports} /> : null}
            {tab === "sauvegardes" ? <BackupPanel sauvegardes={sauvegardes} fuseau={fuseau} /> : null}
          </div>
        </Card>

        <Card className="h-fit p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-[1.25rem] font-semibold">
            <Lock size={20} /> État du stockage
          </h2>
          <p className="text-[14.5px] text-muted">Les données vivent dans un classeur Excel privé, sur le disque du serveur.</p>
          <dl className="num mt-4 flex flex-col gap-2 text-[15px]">
            {[
              ["Révision du classeur", String(stockage.revision)],
              ["Dernière écriture", formatDateTime(stockage.majLe, fuseau || undefined)],
              ["Taille du classeur", formatBytes(stockage.tailleOctets)],
              ["Lignes enregistrées", String(stockage.lignes)],
              ["Actions au journal", String(stockage.historique)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-line pb-2">
                <dt className="text-muted">{k}</dt>
                <dd className="text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          {stockage.demo ? <Badge tone="olive" dot className="mt-3">Contient des données de démonstration</Badge> : null}
          <Callout tone="neutral" className="mt-4" title="Limites à connaître">
            Chaque enregistrement réécrit le classeur entier : prévu pour un restaurant, quelques écritures par seconde et quelques milliers de lignes. Une seule instance du serveur peut écrire. N'ouvrez pas le classeur dans Excel pendant que l'application tourne.
          </Callout>
        </Card>
      </div>
    </>
  );
}
