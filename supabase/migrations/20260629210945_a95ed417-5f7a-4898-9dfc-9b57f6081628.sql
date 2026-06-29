UPDATE public.production_orders po
SET assigned_to_label = CASE b.slug
  WHEN 'espacio-inmobiliario' THEN 'Alejandra'
  WHEN 'montenegro-design'    THEN 'Alejandra'
  WHEN 'getova'               THEN 'Alejandra'
  WHEN 'casa-diseno'          THEN 'Jonathan'
  ELSE po.assigned_to_label
END
FROM public.brands b
WHERE b.id = po.brand_id
  AND (po.assigned_to_label IS NULL OR btrim(po.assigned_to_label) = '');