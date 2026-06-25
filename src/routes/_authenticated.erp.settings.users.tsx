import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldAlert, UserPlus } from "lucide-react";

import { createUserAccount, listUsers } from "@/lib/admin-users.functions";
import { useBrand } from "@/features/brands/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/erp/settings/users")({
  head: () => ({
    meta: [{ title: "Usuarios — Grupo Getova" }],
  }),
  component: UsersAdminPage,
});

const ROLES = [
  { value: "admin", label: "Administrador" },
  { value: "operativo", label: "Operativo / Bodega" },
  { value: "finanzas", label: "Finanzas" },
  { value: "ventas", label: "Ventas (gerente)" },
  { value: "vendedor", label: "Vendedor" },
] as const;

function UsersAdminPage() {
  const navigate = useNavigate();
  const { isAdmin } = useBrand();
  const qc = useQueryClient();

  const listFn = useServerFn(listUsers);
  const createFn = useServerFn(createUserAccount);

  useEffect(() => {
    if (!isAdmin) {
      toast.error("Acceso restringido", { description: "Solo administradores." });
      navigate({ to: "/erp" });
    }
  }, [isAdmin, navigate]);

  const usersQuery = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => listFn(),
    enabled: isAdmin,
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<string>("vendedor");

  const createMutation = useMutation({
    mutationFn: async () =>
      createFn({ data: { email, password, displayName, role: role as any } }),
    onSuccess: () => {
      toast.success("Cuenta creada", { description: `${email} · ${role}` });
      setEmail(""); setPassword(""); setDisplayName(""); setRole("vendedor");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err: any) => {
      toast.error("No se pudo crear la cuenta", { description: err?.message });
    },
  });

  if (!isAdmin) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <ShieldAlert className="h-4 w-4" /> Acceso restringido.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Usuarios y accesos</h1>
        <p className="text-sm text-muted-foreground">
          Crea cuentas internas y asigna su rol. La creación pública de cuentas está deshabilitada.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Crear nueva cuenta
          </CardTitle>
          <CardDescription>
            La cuenta queda lista para iniciar sesión inmediatamente con la contraseña que asignes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!email || !password || !displayName) {
                toast.error("Completa todos los campos");
                return;
              }
              if (password.length < 8) {
                toast.error("La contraseña debe tener al menos 8 caracteres");
                return;
              }
              createMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="u-name">Nombre completo</Label>
              <Input id="u-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Ej: Juan Pérez" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="u-email">Correo electrónico</Label>
              <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@grupogetova.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="u-pass">Contraseña inicial</Label>
              <Input id="u-pass" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" />
            </div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Crear cuenta
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usuarios existentes</CardTitle>
          <CardDescription>Listado de cuentas activas en el sistema.</CardDescription>
        </CardHeader>
        <CardContent>
          {usersQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Correo</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Creado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(usersQuery.data ?? []).map((u: any) => (
                  <TableRow key={u.user_id}>
                    <TableCell>{u.display_name || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{u.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.roles.length === 0 ? (
                          <Badge variant="outline">sin rol</Badge>
                        ) : (
                          u.roles.map((r: string) => (
                            <Badge key={r} variant="secondary">{r}</Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
