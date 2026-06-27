import { useEffect, useRef, useState, useCallback } from "react";
import {
  Pencil, Highlighter, ArrowUpRight, StickyNote, Undo2, Trash2, Loader2, Save, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  rasterizePdfPages,
  canvasesToPdfBlob,
  uploadAnnotatedPlanimetry,
} from "@/lib/planimetry-annotate";

type Tool = "pen" | "highlighter" | "arrow" | "memo";

const COLORS = [
  { id: "red", label: "Rojo", value: "#D32F2F" },
  { id: "blue", label: "Azul", value: "#1565C0" },
  { id: "black", label: "Negro", value: "#111111" },
] as const;

type Stroke =
  | { kind: "free"; color: string; width: number; alpha: number; points: { x: number; y: number }[] }
  | { kind: "arrow"; color: string; from: { x: number; y: number }; to: { x: number; y: number } }
  | { kind: "memo"; color: string; x: number; y: number; w: number; h: number; text: string };

type PageState = {
  base: HTMLCanvasElement; // rasterized PDF page
  strokes: Stroke[];
};

export function PlanimetryAnnotatorDialog({
  open,
  onOpenChange,
  pdfUrl,
  baseFileName,
  productionOrderId,
  brandId,
  orderItemId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pdfUrl: string;
  baseFileName: string;
  productionOrderId: string;
  brandId: string;
  orderItemId: string | null;
  onSaved: () => void;
}) {
  const [pages, setPages] = useState<PageState[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [activePage, setActivePage] = useState(0);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<string>(COLORS[0].value);
  const [saving, setSaving] = useState(false);

  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef<{ stroke: Stroke | null }>({ stroke: null });

  // Load PDF when dialog opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setPages(null);
    setActivePage(0);
    (async () => {
      try {
        const canvases = await rasterizePdfPages(pdfUrl, 150);
        if (cancelled) return;
        setPages(canvases.map((c) => ({ base: c, strokes: [] })));
      } catch (e: any) {
        toast.error(e?.message ?? "No se pudo cargar la planimetría");
        onOpenChange(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, pdfUrl, onOpenChange]);

  const redraw = useCallback(() => {
    const overlay = overlayRef.current;
    const page = pages?.[activePage];
    if (!overlay || !page) return;
    overlay.width = page.base.width;
    overlay.height = page.base.height;
    const ctx = overlay.getContext("2d")!;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    for (const s of page.strokes) drawStroke(ctx, s);
    // also draw the in-progress stroke
    if (drawingRef.current.stroke) drawStroke(ctx, drawingRef.current.stroke);
  }, [pages, activePage]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  function localPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = overlayRef.current!;
    const rect = c.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * c.width,
      y: ((e.clientY - rect.top) / rect.height) * c.height,
    };
  }

  function startStroke(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!pages) return;
    if (tool === "memo") {
      const p = localPoint(e);
      const text = window.prompt("Texto de la nota:", "");
      if (text == null || text.trim() === "") return;
      const w = 220;
      const lines = wrapText(text.trim(), 24);
      const h = Math.max(60, 24 + lines.length * 18);
      pushStroke({ kind: "memo", color, x: p.x, y: p.y, w, h, text: text.trim() });
      return;
    }
    const p = localPoint(e);
    if (tool === "arrow") {
      drawingRef.current.stroke = { kind: "arrow", color, from: p, to: p };
    } else {
      const width = tool === "highlighter" ? 22 : 3;
      const alpha = tool === "highlighter" ? 0.32 : 1;
      drawingRef.current.stroke = {
        kind: "free",
        color,
        width,
        alpha,
        points: [p],
      };
    }
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    redraw();
  }

  function moveStroke(e: React.PointerEvent<HTMLCanvasElement>) {
    const s = drawingRef.current.stroke;
    if (!s) return;
    const p = localPoint(e);
    if (s.kind === "arrow") s.to = p;
    else if (s.kind === "free") s.points.push(p);
    redraw();
  }

  function endStroke() {
    const s = drawingRef.current.stroke;
    drawingRef.current.stroke = null;
    if (s) pushStroke(s);
    else redraw();
  }

  function pushStroke(s: Stroke) {
    setPages((prev) => {
      if (!prev) return prev;
      const next = prev.slice();
      next[activePage] = {
        ...next[activePage],
        strokes: [...next[activePage].strokes, s],
      };
      return next;
    });
  }

  function undo() {
    setPages((prev) => {
      if (!prev) return prev;
      const next = prev.slice();
      const arr = next[activePage].strokes.slice();
      arr.pop();
      next[activePage] = { ...next[activePage], strokes: arr };
      return next;
    });
  }

  function clearAll() {
    setPages((prev) => {
      if (!prev) return prev;
      const next = prev.slice();
      next[activePage] = { ...next[activePage], strokes: [] };
      return next;
    });
  }

  async function handleSave() {
    if (!pages) return;
    setSaving(true);
    try {
      // Flatten each page into a fresh canvas (base + strokes)
      const flat = pages.map((pg) => {
        const out = document.createElement("canvas");
        out.width = pg.base.width;
        out.height = pg.base.height;
        const ctx = out.getContext("2d")!;
        ctx.drawImage(pg.base, 0, 0);
        for (const s of pg.strokes) drawStroke(ctx, s);
        return out;
      });
      const blob = await canvasesToPdfBlob(flat);
      const v = await uploadAnnotatedPlanimetry({
        productionOrderId,
        brandId,
        orderItemId,
        baseFileName,
        blob,
      });
      toast.success(`Planimetría anotada guardada (v${v})`);
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const page = pages?.[activePage];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1100px] w-[95vw] h-[92vh] flex flex-col gap-3 p-4">
        <DialogHeader>
          <DialogTitle>Anotar planimetría</DialogTitle>
          <DialogDescription className="text-xs">
            Marca, resalta o agrega notas. Al guardar se crea una nueva versión sin tocar la original.
          </DialogDescription>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 p-2">
          <ToolBtn active={tool === "pen"} onClick={() => setTool("pen")} icon={<Pencil className="h-4 w-4" />} label="Lápiz" />
          <ToolBtn active={tool === "highlighter"} onClick={() => setTool("highlighter")} icon={<Highlighter className="h-4 w-4" />} label="Resaltador" />
          <ToolBtn active={tool === "arrow"} onClick={() => setTool("arrow")} icon={<ArrowUpRight className="h-4 w-4" />} label="Flecha" />
          <ToolBtn active={tool === "memo"} onClick={() => setTool("memo")} icon={<StickyNote className="h-4 w-4" />} label="Nota" />

          <span className="mx-2 h-5 w-px bg-border" />

          {COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setColor(c.value)}
              className={cn(
                "h-7 w-7 rounded-full border-2 transition",
                color === c.value ? "border-foreground scale-110" : "border-border",
              )}
              style={{ backgroundColor: c.value }}
              aria-label={c.label}
              title={c.label}
            />
          ))}

          <span className="mx-2 h-5 w-px bg-border" />

          <Button size="sm" variant="outline" onClick={undo} disabled={!page || page.strokes.length === 0}>
            <Undo2 className="h-4 w-4 mr-1" /> Deshacer
          </Button>
          <Button size="sm" variant="outline" onClick={clearAll} disabled={!page || page.strokes.length === 0}>
            <Trash2 className="h-4 w-4 mr-1" /> Limpiar
          </Button>

          <span className="ml-auto flex items-center gap-2">
            {pages && pages.length > 1 ? (
              <div className="flex items-center gap-1">
                {pages.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActivePage(i)}
                    className={cn(
                      "h-7 w-7 rounded text-xs font-medium border",
                      i === activePage ? "bg-foreground text-background border-foreground" : "border-border",
                    )}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            ) : null}
          </span>
        </div>

        {/* Canvas area */}
        <div className="flex-1 min-h-0 overflow-auto rounded-md border border-border bg-neutral-200 dark:bg-neutral-800 grid place-items-center p-3">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Cargando PDF…
            </div>
          ) : page ? (
            <div className="relative shadow-lg" style={{ width: "min(100%, 900px)" }}>
              <img
                src={page.base.toDataURL("image/jpeg", 0.9)}
                alt="Página"
                className="w-full h-auto block bg-white"
                draggable={false}
              />
              <canvas
                ref={overlayRef}
                className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
                onPointerDown={startStroke}
                onPointerMove={moveStroke}
                onPointerUp={endStroke}
                onPointerLeave={endStroke}
              />
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            <X className="h-4 w-4 mr-1" /> Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !pages}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Guardar nueva versión
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToolBtn({
  active, onClick, icon, label,
}: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-2.5 h-8 rounded text-xs font-medium border transition",
        active ? "bg-foreground text-background border-foreground" : "border-border hover:bg-muted",
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  ctx.save();
  if (s.kind === "free") {
    ctx.globalAlpha = s.alpha;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    s.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
  } else if (s.kind === "arrow") {
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(s.from.x, s.from.y);
    ctx.lineTo(s.to.x, s.to.y);
    ctx.stroke();
    // arrow head
    const dx = s.to.x - s.from.x;
    const dy = s.to.y - s.from.y;
    const ang = Math.atan2(dy, dx);
    const len = 14;
    ctx.beginPath();
    ctx.moveTo(s.to.x, s.to.y);
    ctx.lineTo(s.to.x - len * Math.cos(ang - Math.PI / 6), s.to.y - len * Math.sin(ang - Math.PI / 6));
    ctx.lineTo(s.to.x - len * Math.cos(ang + Math.PI / 6), s.to.y - len * Math.sin(ang + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  } else if (s.kind === "memo") {
    // sticky note
    ctx.fillStyle = "#FFF59D"; // pale yellow
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.strokeRect(s.x, s.y, s.w, s.h);
    ctx.fillStyle = "#111111";
    ctx.font = "14px Helvetica, Arial, sans-serif";
    ctx.textBaseline = "top";
    const lines = wrapText(s.text, 24);
    lines.forEach((ln, i) => {
      ctx.fillText(ln, s.x + 8, s.y + 8 + i * 18);
    });
  }
  ctx.restore();
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length <= maxCharsPerLine) {
      cur = (cur + " " + w).trim();
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
