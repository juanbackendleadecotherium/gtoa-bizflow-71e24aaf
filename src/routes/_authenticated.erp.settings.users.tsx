import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Loader2, ShieldAlert, UserPlus, MoreHorizontal, Search, KeyRound,
  Ban, CheckCircle2, LogOut, Trash2, Pencil, ShieldCheck, RefreshCw, Copy,
} from "lucide-react";

import {
  createUserAccount, listUsers, listBrandsForAdmin, updateUserProfile,
  setUserRoles, setUserBrands, resetUserPassword, setUserSuspended,
  signOutUser, deleteUser, listUserAuditLog,
} from "@/lib/admin-users.functions";
import { useBrand } from "@/features/brands/brand-context";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/erp/settings/users")({
  head: () => ({ meta: [{ title: "Usuarios — Grupo Getova" }] }),
  component: UsersAdminPage,
});

const ROLES = [
  { value: "admin", label: "Administrador" },
  { value: "finanzas", label: "Gerente de Finanzas" },
  { value: "ventas", label: "Gerente de Ventas" },
  { value: "vendedor", label: "Vendedor" },
  { value: "operativo", label: "Operativo de Bodega" },
  { value: "logistica", label: "Logística" },
] as const;
type RoleValue = (typeof ROLES)[number]["value"];

type UserRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  created_at: string | null;
  roles: RoleValue[];
  brand_ids: string[];
  last_sign_in_at: string | null;
  banned_until: string | null;
  is_suspended: boolean;
};

function generatePassword(len = 14) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
  let out = "";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
}

function initials(name: string | null, email: string) {
  const base = (name || email).trim();
  const parts = base.split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || base[0].toUpperCase();
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
}

function UsersAdminPage() {
  const navigate = useNavigate();
  const { isAdmin, roles } = useBrand();
  const isFinanzas = roles.includes("finanzas");
  const canManage = isAdmin || isFinanzas;
  const qc = useQueryClient();

  const listFn = useServerFn(listUsers);
  const listBrandsFn = useServerFn(listBrandsForAdmin);
  const listAuditFn = useServerFn(listUserAuditLog);

  useEffect(() => {
    if (!canManage) {
      toast.error("Acceso restringido", { description: "Solo administradores o gerentes de finanzas." });
      navigate({ to: "/erp" });
    }
  }, [canManage, navigate]);

  const usersQuery = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => listFn(),
    enabled: canManage,
  });
  const brandsQuery = useQuery({
    queryKey: ["admin", "brands"],
    queryFn: () => listBrandsFn(),
    enabled: canManage,
  });
  const auditQuery = useQuery({
    queryKey: ["admin", "user-audit"],
    queryFn: () => listAuditFn(),
    enabled: canManage,
  });

  const brandNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of brandsQuery.data ?? []) m.set(b.id, b.name);
    return m;
  }, [brandsQuery.data]);

  // Filters
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterBrand, setFilterBrand] = useState<string>("all");
  const [onlyActive, setOnlyActive] = useState(false);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (usersQuery.data ?? []).filter((u: UserRow) => {
      if (q && !`${u.email} ${u.display_name ?? ""}`.toLowerCase().includes(q)) return false;
      if (filterRole !== "all" && !u.roles.includes(filterRole as RoleValue)) return false;
      if (filterBrand !== "all" && !u.brand_ids.includes(filterBrand)) return false;
      if (onlyActive && u.is_suspended) return false;
      return true;
    });
  }, [usersQuery.data, search, filterRole, filterBrand, onlyActive]);

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [rolesUser, setRolesUser] = useState<UserRow | null>(null);
  const [brandsUser, setBrandsUser] = useState<UserRow | null>(null);
  const [passwordUser, setPasswordUser] = useState<UserRow | null>(null);
  const [deleteUserState, setDeleteUserState] = useState<UserRow | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin", "users"] });
    qc.invalidateQueries({ queryKey: ["admin", "user-audit"] });
  };

  if (!canManage) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <ShieldAlert className="h-4 w-4" /> Acceso restringido.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Usuarios y accesos</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona cuentas internas, roles y marcas asignadas. La creación pública de cuentas está deshabilitada.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" /> Nueva cuenta
        </Button>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Usuarios</TabsTrigger>
          <TabsTrigger value="audit">Auditoría</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4 mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="grid gap-3 md:grid-cols-[1fr_180px_180px_auto]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Buscar por nombre o correo…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Select value={filterRole} onValueChange={setFilterRole}>
                  <SelectTrigger><SelectValue placeholder="Rol" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los roles</SelectItem>
                    {ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterBrand} onValueChange={setFilterBrand}>
                  <SelectTrigger><SelectValue placeholder="Marca" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las marcas</SelectItem>
                    {(brandsQuery.data ?? []).map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={onlyActive} onCheckedChange={setOnlyActive} />
                  Solo activos
                </label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              {usersQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando usuarios…
                </div>
              ) : filteredUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay usuarios que coincidan con los filtros.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuario</TableHead>
                      <TableHead>Roles</TableHead>
                      <TableHead>Marcas</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Último ingreso</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((u: UserRow) => (
                      <TableRow key={u.user_id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                              {initials(u.display_name, u.email ?? "")}
                            </div>
                            <div>
                              <div className="font-medium">{u.display_name || "—"}</div>
                              <div className="text-xs text-muted-foreground font-mono">{u.email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {u.roles.length === 0
                              ? <Badge variant="outline">sin rol</Badge>
                              : u.roles.map((r) => <Badge key={r} variant="secondary">{r}</Badge>)
                            }
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {u.roles.includes("admin")
                              ? <Badge variant="outline" className="text-xs">todas</Badge>
                              : u.brand_ids.length === 0
                                ? <span className="text-xs text-muted-foreground">—</span>
                                : u.brand_ids.slice(0, 3).map((bid) => (
                                    <Badge key={bid} variant="outline" className="text-xs">
                                      {brandNameById.get(bid) ?? "?"}
                                    </Badge>
                                  ))
                            }
                            {!u.roles.includes("admin") && u.brand_ids.length > 3 && (
                              <Badge variant="outline" className="text-xs">+{u.brand_ids.length - 3}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {u.is_suspended
                            ? <Badge variant="destructive">Suspendido</Badge>
                            : <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Activo</Badge>
                          }
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fmtDate(u.last_sign_in_at)}
                        </TableCell>
                        <TableCell>
                          <UserActions
                            user={u}
                            onEdit={() => setEditUser(u)}
                            onRoles={() => setRolesUser(u)}
                            onBrands={() => setBrandsUser(u)}
                            onPassword={() => setPasswordUser(u)}
                            onDelete={() => setDeleteUserState(u)}
                            onChange={refresh}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Auditoría (últimas 200)</CardTitle>
              <CardDescription>Acciones realizadas desde el panel de administración.</CardDescription>
            </CardHeader>
            <CardContent>
              {auditQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Acción</TableHead>
                      <TableHead>Objetivo</TableHead>
                      <TableHead>Detalles</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(auditQuery.data ?? []).map((row: any) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {fmtDate(row.created_at)}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{row.actor_email ?? "—"}</TableCell>
                        <TableCell><Badge variant="outline">{row.action}</Badge></TableCell>
                        <TableCell className="text-xs font-mono">{row.target_email ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-md truncate">
                          {row.details && Object.keys(row.details).length > 0
                            ? JSON.stringify(row.details)
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {createOpen && (
        <CreateUserDialog
          brands={brandsQuery.data ?? []}
          canAssignAdmin={isAdmin}
          onClose={() => setCreateOpen(false)}
          onSuccess={() => { setCreateOpen(false); refresh(); }}
        />
      )}
      {editUser && (
        <EditProfileDialog
          user={editUser}
          onClose={() => setEditUser(null)}
          onSuccess={() => { setEditUser(null); refresh(); }}
        />
      )}
      {rolesUser && (
        <RolesDialog
          user={rolesUser}
          canAssignAdmin={isAdmin}
          onClose={() => setRolesUser(null)}
          onSuccess={() => { setRolesUser(null); refresh(); }}
        />
      )}
      {brandsUser && (
        <BrandsDialog
          user={brandsUser}
          brands={brandsQuery.data ?? []}
          onClose={() => setBrandsUser(null)}
          onSuccess={() => { setBrandsUser(null); refresh(); }}
        />
      )}
      {passwordUser && (
        <PasswordDialog
          user={passwordUser}
          onClose={() => setPasswordUser(null)}
          onSuccess={() => { setPasswordUser(null); refresh(); }}
        />
      )}
      {deleteUserState && (
        <DeleteDialog
          user={deleteUserState}
          onClose={() => setDeleteUserState(null)}
          onSuccess={() => { setDeleteUserState(null); refresh(); }}
        />
      )}
    </div>
  );
}

// =========================================================================
// User actions menu
// =========================================================================

function UserActions({
  user, onEdit, onRoles, onBrands, onPassword, onDelete, onChange,
}: {
  user: UserRow;
  onEdit: () => void;
  onRoles: () => void;
  onBrands: () => void;
  onPassword: () => void;
  onDelete: () => void;
  onChange: () => void;
}) {
  const suspendFn = useServerFn(setUserSuspended);
  const signOutFn = useServerFn(signOutUser);

  const suspendMut = useMutation({
    mutationFn: (suspend: boolean) =>
      suspendFn({ data: { userId: user.user_id, suspend } }),
    onSuccess: (_d, suspend) => {
      toast.success(suspend ? "Cuenta suspendida" : "Cuenta reactivada");
      onChange();
    },
    onError: (e: any) => toast.error("Error", { description: e?.message }),
  });

  const signOutMut = useMutation({
    mutationFn: () => signOutFn({ data: { userId: user.user_id } }),
    onSuccess: () => toast.success("Sesiones revocadas"),
    onError: (e: any) => toast.error("Error", { description: e?.message }),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Cuenta</DropdownMenuLabel>
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="h-4 w-4 mr-2" /> Editar perfil
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onRoles}>
          <ShieldCheck className="h-4 w-4 mr-2" /> Roles
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onBrands} disabled={user.roles.includes("admin")}>
          Marcas asignadas
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onPassword}>
          <KeyRound className="h-4 w-4 mr-2" /> Resetear contraseña
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => signOutMut.mutate()}>
          <LogOut className="h-4 w-4 mr-2" /> Cerrar sesiones
        </DropdownMenuItem>
        {user.is_suspended ? (
          <DropdownMenuItem onClick={() => suspendMut.mutate(false)}>
            <CheckCircle2 className="h-4 w-4 mr-2" /> Reactivar
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => suspendMut.mutate(true)}>
            <Ban className="h-4 w-4 mr-2" /> Suspender
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
          <Trash2 className="h-4 w-4 mr-2" /> Eliminar cuenta
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// =========================================================================
// Create dialog
// =========================================================================

function CreateUserDialog({
  brands, canAssignAdmin, onClose, onSuccess,
}: { brands: { id: string; name: string }[]; canAssignAdmin: boolean; onClose: () => void; onSuccess: () => void }) {
  const availableRoles = canAssignAdmin ? ROLES : ROLES.filter((r) => r.value !== "admin");
  const createFn = useServerFn(createUserAccount);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState(() => generatePassword());
  const [roles, setRoles] = useState<RoleValue[]>(["vendedor"]);
  const [brandIds, setBrandIds] = useState<string[]>([]);

  const isAdminRole = roles.includes("admin");

  const m = useMutation({
    mutationFn: () =>
      createFn({ data: { email, password, displayName, roles, brandIds: isAdminRole ? [] : brandIds } }),
    onSuccess: () => {
      toast.success("Cuenta creada", { description: email });
      onSuccess();
    },
    onError: (e: any) => toast.error("No se pudo crear la cuenta", { description: e?.message }),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nueva cuenta de usuario</DialogTitle>
          <DialogDescription>Configura los datos, roles y marcas asignadas.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!email || !password || !displayName) return toast.error("Completa todos los campos");
            if (password.length < 8) return toast.error("Contraseña ≥ 8 caracteres");
            if (roles.length === 0) return toast.error("Asigna al menos un rol");
            m.mutate();
          }}
        >
          <div className="space-y-2">
            <Label>Nombre completo</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Juan Pérez" />
          </div>
          <div className="space-y-2">
            <Label>Correo electrónico</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@grupogetova.com" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Contraseña inicial</Label>
            <div className="flex gap-2">
              <Input value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
              <Button type="button" variant="outline" size="icon" onClick={() => setPassword(generatePassword())} title="Generar">
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(password); toast.success("Copiada"); }} title="Copiar">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Cópiala y compártela de forma segura. El usuario puede cambiarla después.</p>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Roles</Label>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map((r) => (
                <label key={r.value} className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer">
                  <Checkbox
                    checked={roles.includes(r.value)}
                    onCheckedChange={(c) => {
                      setRoles((prev) => c ? [...prev, r.value] : prev.filter((x) => x !== r.value));
                    }}
                  />
                  <span className="text-sm">{r.label}</span>
                </label>
              ))}
            </div>
          </div>
          {!isAdminRole && (
            <div className="space-y-2 md:col-span-2">
              <Label>Marcas asignadas</Label>
              {brands.length === 0
                ? <p className="text-xs text-muted-foreground">No hay marcas para asignar.</p>
                : (
                  <div className="grid grid-cols-2 gap-2">
                    {brands.map((b) => (
                      <label key={b.id} className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer">
                        <Checkbox
                          checked={brandIds.includes(b.id)}
                          onCheckedChange={(c) => {
                            setBrandIds((prev) => c ? [...prev, b.id] : prev.filter((x) => x !== b.id));
                          }}
                        />
                        <span className="text-sm">{b.name}</span>
                      </label>
                    ))}
                  </div>
                )
              }
              <p className="text-xs text-muted-foreground">Los administradores tienen acceso a todas las marcas automáticamente.</p>
            </div>
          )}
          <DialogFooter className="md:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={m.isPending}>
              {m.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Crear cuenta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =========================================================================
// Edit profile dialog
// =========================================================================

function EditProfileDialog({ user, onClose, onSuccess }: { user: UserRow; onClose: () => void; onSuccess: () => void }) {
  const fn = useServerFn(updateUserProfile);
  const [displayName, setDisplayName] = useState(user.display_name ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const m = useMutation({
    mutationFn: () => fn({ data: { userId: user.user_id, displayName, email } }),
    onSuccess: () => { toast.success("Perfil actualizado"); onSuccess(); },
    onError: (e: any) => toast.error("Error", { description: e?.message }),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar perfil</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2"><Label>Nombre</Label><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div>
          <div className="space-y-2"><Label>Correo</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =========================================================================
// Roles dialog
// =========================================================================

function RolesDialog({ user, onClose, onSuccess }: { user: UserRow; onClose: () => void; onSuccess: () => void }) {
  const fn = useServerFn(setUserRoles);
  const [roles, setRoles] = useState<RoleValue[]>(user.roles);
  const m = useMutation({
    mutationFn: () => fn({ data: { userId: user.user_id, roles } }),
    onSuccess: () => { toast.success("Roles actualizados"); onSuccess(); },
    onError: (e: any) => toast.error("Error", { description: e?.message }),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Roles de {user.display_name || user.email}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {ROLES.map((r) => (
            <label key={r.value} className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer">
              <Checkbox
                checked={roles.includes(r.value)}
                onCheckedChange={(c) => {
                  setRoles((prev) => c ? [...prev, r.value] : prev.filter((x) => x !== r.value));
                }}
              />
              <span className="text-sm">{r.label}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =========================================================================
// Brands dialog
// =========================================================================

function BrandsDialog({
  user, brands, onClose, onSuccess,
}: { user: UserRow; brands: { id: string; name: string }[]; onClose: () => void; onSuccess: () => void }) {
  const fn = useServerFn(setUserBrands);
  const [brandIds, setBrandIds] = useState<string[]>(user.brand_ids);
  const m = useMutation({
    mutationFn: () => fn({ data: { userId: user.user_id, brandIds } }),
    onSuccess: () => { toast.success("Marcas actualizadas"); onSuccess(); },
    onError: (e: any) => toast.error("Error", { description: e?.message }),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Marcas asignadas</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {brands.map((b) => (
            <label key={b.id} className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer">
              <Checkbox
                checked={brandIds.includes(b.id)}
                onCheckedChange={(c) => {
                  setBrandIds((prev) => c ? [...prev, b.id] : prev.filter((x) => x !== b.id));
                }}
              />
              <span className="text-sm">{b.name}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =========================================================================
// Password dialog
// =========================================================================

function PasswordDialog({ user, onClose, onSuccess }: { user: UserRow; onClose: () => void; onSuccess: () => void }) {
  const fn = useServerFn(resetUserPassword);
  const [pwd, setPwd] = useState(() => generatePassword());
  const m = useMutation({
    mutationFn: () => fn({ data: { userId: user.user_id, newPassword: pwd } }),
    onSuccess: () => { toast.success("Contraseña actualizada"); onSuccess(); },
    onError: (e: any) => toast.error("Error", { description: e?.message }),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resetear contraseña</DialogTitle>
          <DialogDescription>Asigna una nueva contraseña a {user.email}.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input value={pwd} onChange={(e) => setPwd(e.target.value)} className="font-mono" />
          <Button variant="outline" size="icon" onClick={() => setPwd(generatePassword())}><RefreshCw className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(pwd); toast.success("Copiada"); }}><Copy className="h-4 w-4" /></Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || pwd.length < 8}>
            {m.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Actualizar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =========================================================================
// Delete dialog
// =========================================================================

function DeleteDialog({ user, onClose, onSuccess }: { user: UserRow; onClose: () => void; onSuccess: () => void }) {
  const fn = useServerFn(deleteUser);
  const [confirm, setConfirm] = useState("");
  const m = useMutation({
    mutationFn: () => fn({ data: { userId: user.user_id, confirmEmail: confirm } }),
    onSuccess: () => { toast.success("Cuenta eliminada"); onSuccess(); },
    onError: (e: any) => toast.error("Error", { description: e?.message }),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-destructive">Eliminar cuenta</DialogTitle>
          <DialogDescription>
            Esta acción es <strong>irreversible</strong>. Para confirmar, escribe el correo exacto:{" "}
            <span className="font-mono">{user.email}</span>
          </DialogDescription>
        </DialogHeader>
        <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={user.email ?? ""} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            variant="destructive"
            disabled={confirm.toLowerCase() !== (user.email ?? "").toLowerCase() || m.isPending}
            onClick={() => m.mutate()}
          >
            {m.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Eliminar definitivamente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
