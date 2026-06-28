import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Database, Loader2, ShieldAlert, Trash2 } from "lucide-react";

import { previewWipeCounts, wipeTransactionalData } from "@/lib/db-admin.functions";
import { useBrand } from "@/features/brands/brand-context";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/erp/settings/database")({
  head: () => ({ meta: [{ title: "Base de datos — Grupo Getova" }] }),
  component: DatabaseAdminPage,
});

const CONFIRM_PHRASE = "LIMPIAR BASE DE DATOS";

function DatabaseAdminPage() {
  const { isAdmin } = useBrand();
  const qc = useQueryClient();
  const preview = useServerFn(previewWipeCounts);
  const wipe = useServerFn(wipeTransactionalData);

  const countsQuery = useQuery({
    queryKey: ["db-admin", "wipe-preview"],
    queryFn: () => preview(),
    enabled: isAdmin,
  });

  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const wipeMutation = useMutation({
    mutationFn: () => wipe({ data: { confirm: confirmText } }),
    onSuccess: (res) => {
      const total = Object.values(res.deleted).reduce((a, b) => a + b, 0);
      toast.success(`Base de datos limpiada (${total} registros eliminados)`);
      setOpen(false);
      setConfirmText("");
      qc.invalidateQueries();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Acceso restringido</AlertTitle>
          <AlertDescription>Solo administradores pueden ver este módulo.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const counts = countsQuery.data ?? {};
  const totalRows = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Database className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Administrar base de datos</h1>
          <p className="text-sm text-muted-foreground">
            Herramientas sensibles. Disponibles solo durante el periodo de pruebas.
          </p>
        </div>
      </div>

      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Acción irreversible</AlertTitle>
        <AlertDescription>
          Esta sección está pensada para limpiar la base de datos antes de salir a producción.
          Cuando el sistema entre en operación real, este módulo debe eliminarse.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            Limpiar base de datos
          </CardTitle>
          <CardDescription>
            Elimina <strong>todas</strong> las ventas, productos, pagos, cuentas de cobro, órdenes de
            producción, planimetrías, movimientos de bodega, tareas y clientes.
            <br />
            <span className="text-foreground">Se conservan:</span> usuarios, roles, marcas,
            proveedores, bodegas y zonas, estados, datos fiscales y términos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Registros que serían eliminados</p>
              {countsQuery.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <Badge variant="outline" className="font-mono">{totalRows} total</Badge>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs font-mono">
              {Object.entries(counts).map(([t, n]) => (
                <div key={t} className="flex justify-between">
                  <span className="text-muted-foreground truncate">{t}</span>
                  <span className={n > 0 ? "text-foreground" : "text-muted-foreground/50"}>{n}</span>
                </div>
              ))}
            </div>
          </div>

          <Button
            variant="destructive"
            onClick={() => { setConfirmText(""); setOpen(true); }}
            disabled={totalRows === 0}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Limpiar base de datos
          </Button>
          {totalRows === 0 ? (
            <p className="text-xs text-muted-foreground">La base de datos ya está vacía.</p>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(o) => !wipeMutation.isPending && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirmar limpieza total
            </DialogTitle>
            <DialogDescription>
              Vas a eliminar <strong>{totalRows}</strong> registros transaccionales.
              Esta acción <strong>no se puede deshacer</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm">
              Para continuar, escribe exactamente: <code className="text-destructive">{CONFIRM_PHRASE}</code>
            </Label>
            <Input
              id="confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_PHRASE}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={wipeMutation.isPending}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => wipeMutation.mutate()}
              disabled={confirmText !== CONFIRM_PHRASE || wipeMutation.isPending}
            >
              {wipeMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Limpiando…</>
              ) : (
                <>Sí, limpiar todo</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
