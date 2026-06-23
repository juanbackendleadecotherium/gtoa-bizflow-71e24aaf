INSERT INTO public.user_roles(user_id, role)
SELECT '373c2edd-913e-4c31-8c60-0bb2928212f0'::uuid, role
FROM public.user_roles WHERE user_id='cd2f65e4-20fb-4a85-87bb-480a2116cb9d'
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_brands(user_id, brand_id)
SELECT '373c2edd-913e-4c31-8c60-0bb2928212f0'::uuid, brand_id
FROM public.user_brands WHERE user_id='cd2f65e4-20fb-4a85-87bb-480a2116cb9d'
ON CONFLICT DO NOTHING;