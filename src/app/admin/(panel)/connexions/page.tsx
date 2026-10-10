import { CashRegister, CreditCard, EnvelopeSimple, Info, LinkSimple, Monitor, Printer, Warning } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { ListEditor } from "@/components/admin/list-editor";
import { Badge, Bubble, Card, CardHeader, PageHeader } from "@/components/ui";
import { requirePage } from "@/lib/server/auth/session";
import { readDb } from "@/lib/server/storage";

export const metadata: Metadata = { title: "Connexions & équipements" };

const ICON: Record<string, React.ReactNode> = { caisse: <CashRegister size={28} weight="light" />, paiement: <CreditCard size={28} weight="light" />, email: <EnvelopeSimple size={28} weight="light" /> };

export default async function Page() {
  await requirePage("restaurant.configurer");
  const db = await readDb();
  return (
    <>
      <PageHeader eyebrow="Réglages" title="Connexions & équipements" subtitle="Préparez les équipements et services qui seront reliés à votre restaurant." photo />

      <div className="grid gap-4 md:grid-cols-3">
        {db.Integrations.map((i) => (
          <Card key={i.id} className="flex flex-col p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <Bubble className="size-16">{ICON[i.type] ?? <LinkSimple size={28} weight="light" />}</Bubble>
              <div className="min-w-0">
                <h2 className="text-[1.3rem] leading-tight font-semibold">{i.nom}</h2>
                <p className="mt-1.5 text-[15px] text-muted">{i.description}</p>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-between gap-3">
              <Badge dot>Non configuré</Badge>
              <span className="text-[13.5px] text-muted">Connecteur non fourni dans cette version</span>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Card className="p-5 sm:p-6">
          <CardHeader icon={<Monitor size={22} />} title="Appareils prévus" description="Déclarez les écrans, tablettes et imprimantes de votre établissement. Ils restent à l'état « À associer » tant qu'aucun connecteur n'est installé." />
          <div className="mt-4">
            <ListEditor
              path="equipements"
              items={db.Equipements.map((e) => ({ id: e.id, nom: e.nom, type: e.type, emplacement: e.emplacement, formatTicket: e.formatTicket }))}
              noun="cet appareil"
              empty="Aucun appareil déclaré."
              addLabel="Ajouter"
              blank={{ nom: "", type: "tablette", emplacement: "", formatTicket: "" }}
              fields={[
                { key: "nom", label: "Nom de l'appareil", type: "text", max: 40 },
                { key: "type", label: "Type", type: "select", className: "w-40", options: [{ value: "ecran_cuisine", label: "Écran cuisine" }, { value: "tablette", label: "Tablette" }, { value: "imprimante", label: "Imprimante" }] },
                { key: "emplacement", label: "Emplacement", type: "text", max: 40, className: "min-w-28 max-w-44" },
                { key: "formatTicket", label: "Format de ticket", type: "select", className: "w-32", options: [{ value: "", label: "Sans ticket" }, { value: "58 mm", label: "58 mm" }, { value: "80 mm", label: "80 mm" }] },
              ]}
            />
          </div>
          <p className="mt-3 flex items-center gap-2 text-[14px] text-muted">
            <Printer size={18} aria-hidden /> Statut de tous les appareils : à associer. Dernière activité : aucune. L'impression automatique reste désactivée jusqu'à la connexion.
          </p>
        </Card>

        <div className="flex flex-col gap-5">
          <Card className="p-5 sm:p-6">
            <CardHeader icon={<LinkSimple size={22} />} title="Étapes de connexion" description="Parcours prévu lorsqu'un connecteur sera disponible." />
            <ol className="mt-4 flex flex-col gap-3">
              {[
                ["Choisir un connecteur", "Sélectionner le service ou l'appareil à relier."],
                ["Autoriser la connexion", "Suivre les instructions du fournisseur."],
                ["Tester", "Vérifier que la connexion fonctionne avant le service."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="num grid size-9 shrink-0 place-items-center rounded-full bg-olive-soft text-[16px] font-semibold text-ink">{i + 1}</span>
                  <span>
                    <span className="block text-[16px] text-ink">{t}</span>
                    <span className="block text-[14px] text-muted">{d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
          <div className="flex gap-3 rounded-2xl border border-warn/20 bg-warn-soft p-5 text-warn">
            <Warning size={24} className="mt-0.5 shrink-0" />
            <div>
              <p className="text-[16.5px] font-semibold">Aucun service externe n'est connecté</p>
              <p className="mt-1 text-[14.5px] opacity-90">Cette version n'envoie aucun e-mail, n'encaisse aucun paiement et n'imprime aucun ticket. Les liens d'invitation sont à transmettre vous-même.</p>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 flex items-center gap-2 text-[14px] text-muted">
        <Info size={18} aria-hidden /> La diffusion en direct entre les écrans du personnel est intégrée à l'application et ne demande aucune configuration.
      </p>
    </>
  );
}
