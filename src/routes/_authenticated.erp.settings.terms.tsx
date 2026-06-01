import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Plus, ShieldCheck, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/features/brands/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/erp/settings/terms")({
  component: TermsPage,
});

function TermsPage() {
  const { isAdmin } = useBrand();
  const qc = useQueryClient();

  const termsQuery = useQuery({
    queryKey: ["terms-versions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("terms_versions")
        .select("id, version, title, content_html, is_active, created_at")
        .order("version", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const active = (termsQuery.data ?? []).find((t) => t.is_active) ?? null;
  const nextVersion =
    (termsQuery.data?.[0]?.version ?? 0) + 1;

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("Términos y Condiciones de Venta");
  const [content, setContent] = useState("");

  useEffect(() => {
    if (active && !showForm) {
      setTitle(active.title);
      setContent(active.content_html);
    }
  }, [active, showForm]);

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!content.trim()) throw new Error("El contenido no puede estar vacío.");
      const { error } = await supabase.from("terms_versions").insert({
        version: nextVersion,
        title: title.trim() || "Términos y Condiciones de Venta",
        content_html: content,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Versión v${nextVersion} publicada`);
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["terms-versions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setActiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("terms_versions").update({ is_active: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Versión activada");
      qc.invalidateQueries({ queryKey: ["terms-versions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return <p className="text-sm text-muted-foreground">Solo administradores pueden gestionar los términos y condiciones.</p>;
  }

  return (
    <>
      <div className="mb-6 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-1">Configuración</p>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <FileText className="h-6 w-6" /> Términos y Condiciones
          </h1>
          <p className="text-sm text-muted-foreground">
            Aplican a todas las marcas. Solo una versión activa a la vez; las anteriores se conservan como historial.
          </p>
        </div>
        {!showForm && (
          <Button onClick={() => { setShowForm(true); setContent(""); setTitle("Términos y Condiciones de Venta"); }} className="gap-2">
            <Plus className="h-4 w-4" /> Publicar nueva versión
          </Button>
        )}
      </div>

      {showForm && (
        <div className="rounded-xl border border-border bg-surface p-5 mb-6 space-y-3">
          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">
              Contenido (texto plano, separa párrafos con doble salto de línea)
            </Label>
            <Textarea
              rows={18}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="1. Aceptación del contrato...&#10;&#10;2. Plazos de entrega..."
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Se publicará como <strong>v{nextVersion}</strong> y reemplazará la activa.
            </p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}>
              {publishMutation.isPending ? "Publicando…" : `Publicar v${nextVersion}`}
            </Button>
          </div>
        </div>
      )}

      {termsQuery.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (termsQuery.data ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface/50 p-8 text-center text-sm text-muted-foreground">
          Aún no hay términos publicados. Publica la primera versión para empezar a emitir facturas.
        </div>
      ) : (
        <div className="space-y-3">
          {termsQuery.data!.map((t) => (
            <div key={t.id} className={`rounded-xl border bg-surface p-4 ${t.is_active ? "border-primary/40" : "border-border"}`}>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">v{t.version}</span>
                  <span className="text-sm">· {t.title}</span>
                  {t.is_active && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 text-[11px] font-medium">
                      <ShieldCheck className="h-3 w-3" /> Activa
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(t.created_at).toLocaleString("es-CO")}
                  </span>
                  {!t.is_active && (
                    <Button size="sm" variant="outline" onClick={() => setActiveMutation.mutate(t.id)}>
                      Activar
                    </Button>
                  )}
                </div>
              </div>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer hover:text-foreground">Ver contenido</summary>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-foreground/80 bg-muted/30 p-3 rounded-lg max-h-80 overflow-y-auto">{t.content_html}</pre>
              </details>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
