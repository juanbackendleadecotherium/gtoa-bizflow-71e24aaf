
CREATE POLICY "Vendedores update brand billing"
  ON public.brands FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'vendedor') AND public.has_brand_access(auth.uid(), id))
  WITH CHECK (public.has_role(auth.uid(), 'vendedor') AND public.has_brand_access(auth.uid(), id));

CREATE POLICY "Vendedores insert terms"
  ON public.terms_versions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'vendedor'));

CREATE POLICY "Vendedores update terms"
  ON public.terms_versions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'vendedor'));
