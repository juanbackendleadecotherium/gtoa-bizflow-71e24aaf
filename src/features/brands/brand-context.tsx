import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Brand = {
  id: string;
  slug: string;
  name: string;
  legal_name: string | null;
  primary_color: string;
  is_active: boolean;
};

type BrandCtx = {
  brands: Brand[];
  loading: boolean;
  selectedBrand: Brand | null;
  selectedBrandId: string | null;
  setSelectedBrandId: (id: string) => void;
  isAdmin: boolean;
  roles: string[];
  restrictedModules: string[];
};

const SELECTED_BRAND_KEY = "getova:selected-brand";
const Ctx = createContext<BrandCtx | null>(null);

export function BrandProvider({ userId, children }: { userId: string | undefined; children: ReactNode }) {
  const rolesQuery = useQuery({
    queryKey: ["roles", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles").select("role").eq("user_id", userId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const roles = useMemo(() => (rolesQuery.data ?? []).map((r) => r.role as string), [rolesQuery.data]);
  const isAdmin = roles.includes("admin");

  const brandsQuery = useQuery({
    queryKey: ["brands", userId, isAdmin],
    enabled: !!userId && !rolesQuery.isLoading,
    queryFn: async (): Promise<Brand[]> => {
      if (isAdmin) {
        const { data, error } = await supabase
          .from("brands")
          .select("id, slug, name, legal_name, primary_color, is_active")
          .order("name");
        if (error) throw error;
        return data ?? [];
      }
      const { data: assignments, error: aErr } = await supabase
        .from("user_brands").select("brand_id").eq("user_id", userId!);
      if (aErr) throw aErr;
      const ids = (assignments ?? []).map((a) => a.brand_id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("brands")
        .select("id, slug, name, legal_name, primary_color, is_active")
        .in("id", ids).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const brands = brandsQuery.data ?? [];
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);

  useEffect(() => {
    if (brands.length === 0) return;
    const stored = typeof window !== "undefined" ? localStorage.getItem(SELECTED_BRAND_KEY) : null;
    const exists = stored && brands.find((b) => b.id === stored);
    setSelectedBrandId(exists ? stored! : brands[0].id);
  }, [brands]);

  useEffect(() => {
    if (selectedBrandId && typeof window !== "undefined") {
      localStorage.setItem(SELECTED_BRAND_KEY, selectedBrandId);
    }
  }, [selectedBrandId]);

  const selectedBrand = brands.find((b) => b.id === selectedBrandId) ?? null;
  const loading = !userId || rolesQuery.isPending || brandsQuery.isPending;

  const value: BrandCtx = {
    brands, loading, selectedBrand, selectedBrandId,
    setSelectedBrandId, isAdmin, roles,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBrand() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBrand must be used inside BrandProvider");
  return ctx;
}
