"use client";

import { CircleNotch, Image as ImageIcon, UploadSimple, X } from "@phosphor-icons/react/dist/ssr";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/format";
import type { MediaLite } from "@/lib/types";
import { ApiError, Modal, useApi } from "../client";
import { Button, EmptyState, Thumb } from "../ui";

/** Envoie un fichier image à la médiathèque. Le serveur vérifie le contenu réel du fichier. */
export function useUpload() {
  const call = useApi();
  const [uploading, setUploading] = useState(false);
  const upload = async (file: File, extra: Record<string, string> = {}, path = "medias"): Promise<MediaRow | null> => {
    const form = new FormData();
    form.set("fichier", file);
    for (const [k, v] of Object.entries(extra)) form.set(k, v);
    setUploading(true);
    try {
      return await call<MediaRow>("POST", path, form);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "L'envoi a échoué.");
      return null;
    } finally {
      setUploading(false);
    }
  };
  return { upload, uploading };
}

export interface MediaRow {
  id: string;
  nom: string;
  alt: string;
  fichier: string;
  miniature: string;
  largeur: number;
  hauteur: number;
  taille: number;
  format: string;
  categorie: string;
}
export const rowToLite = (m: MediaRow): MediaLite => ({ id: m.id, nom: m.nom, alt: m.alt, thumb: `/api/admin/medias/fichier/${m.miniature}`, src: `/api/admin/medias/fichier/${m.fichier}`, largeur: m.largeur, hauteur: m.hauteur, taille: m.taille, format: m.format, categorie: m.categorie });

export function MediaPicker({ medias, value, onChange, label = "Choisir une image", categorie = "produits", aspect = "aspect-[4/3]", allowClear = true }: { medias: MediaLite[]; value: string; onChange: (id: string) => void; label?: string; categorie?: string; aspect?: string; allowClear?: boolean }) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<MediaLite[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useUpload();
  const all = [...added.filter((a) => !medias.some((m) => m.id === a.id)), ...medias];
  const current = all.find((m) => m.id === value);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const row = await upload(file, { categorie });
    if (row) {
      setAdded((a) => [rowToLite(row), ...a]);
      onChange(row.id);
      setOpen(false);
      toast.success("Image importée.");
    }
    if (input.current) input.current.value = "";
  };

  return (
    <div>
      <div className={cn("relative overflow-hidden rounded-xl border border-line bg-olive-tint", aspect)}>
        {current ? (
          <Thumb src={current.src} alt={current.alt || current.nom} className="size-full rounded-none" />
        ) : (
          <div className="grid size-full place-items-center text-muted">
            <ImageIcon size={32} weight="light" />
          </div>
        )}
        {current && allowClear ? (
          <button type="button" aria-label="Retirer l'image" onClick={() => onChange("")} className="press absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-white/95 text-ink shadow-card">
            <X size={16} />
          </button>
        ) : null}
      </div>
      <Button variant="secondary" className="mt-2 w-full" onClick={() => setOpen(true)}>
        <ImageIcon size={18} /> {label}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        description="Sélectionnez une image de la médiathèque ou importez-en une nouvelle."
        wide
        footer={
          <>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Importer une image" tabIndex={-1} className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <Button variant="outline" disabled={uploading} onClick={() => input.current?.click()}>
              {uploading ? <CircleNotch size={18} className="animate-spin" /> : <UploadSimple size={18} />}
              Importer une image
            </Button>
          </>
        }
      >
        {all.length === 0 ? (
          <EmptyState icon={<ImageIcon size={24} />} title="La médiathèque est vide">
            Importez une première image au format JPG, PNG ou WebP (10 Mo maximum).
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {all.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  aria-pressed={m.id === value}
                  onClick={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                  className={cn("press block w-full overflow-hidden rounded-xl border-2 text-left", m.id === value ? "border-olive" : "border-transparent hover:border-line-strong")}
                >
                  <Thumb src={m.thumb} alt={m.alt || m.nom} className="aspect-[4/3] w-full rounded-none" />
                  <span className="block truncate px-2 py-1.5 text-[13.5px] text-muted">{m.nom}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
