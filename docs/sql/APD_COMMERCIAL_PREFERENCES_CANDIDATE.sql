-- Disposable candidate: optimistic compare-and-save under row lock.
BEGIN;
CREATE FUNCTION public.apd_save_free_preferences(p_user_id uuid,p_expected jsonb,p_next jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
DECLARE old_row public.user_preferences%ROWTYPE; expected_row public.user_preferences%ROWTYPE;
 next_row public.user_preferences%ROWTYPE; saved public.user_preferences%ROWTYPE; existed boolean;
BEGIN
 IF p_next IS NULL OR jsonb_typeof(p_next)<>'object' OR p_next->>'user_id' IS DISTINCT FROM p_user_id::text THEN
  RETURN jsonb_build_object('ok',false,'reason','invalid_payload');
 END IF;
 IF p_expected IS NOT NULL AND (jsonb_typeof(p_expected)<>'object' OR p_expected->>'user_id' IS DISTINCT FROM p_user_id::text) THEN
  RETURN jsonb_build_object('ok',false,'reason','invalid_snapshot');
 END IF;
 PERFORM 1 FROM public.users WHERE id=p_user_id AND activo IS TRUE FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','account_unavailable'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.subscription_plans WHERE code='FREE' AND is_active AND price_ars=0 AND max_distritos=1 AND max_cargos=1) THEN
  RETURN jsonb_build_object('ok',false,'reason','release_disabled');
 END IF;
 SELECT * INTO old_row FROM public.user_preferences WHERE user_id=p_user_id FOR UPDATE;
 existed=FOUND;
 IF existed THEN
  IF p_expected IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','conflict'); END IF;
  expected_row=jsonb_populate_record(NULL::public.user_preferences,p_expected);
  IF old_row IS DISTINCT FROM expected_row THEN RETURN jsonb_build_object('ok',false,'reason','conflict'); END IF;
 ELSE
  IF p_expected IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'reason','conflict'); END IF;
 END IF;
 next_row=jsonb_populate_record(NULL::public.user_preferences,p_next);
 next_row.updated_at=greatest(clock_timestamp(),old_row.updated_at+interval '1 microsecond');
 IF existed THEN
  UPDATE public.user_preferences SET distrito_principal=next_row.distrito_principal,otros_distritos=next_row.otros_distritos,cargos=next_row.cargos,materias=next_row.materias,niveles=next_row.niveles,turnos=next_row.turnos,alertas_activas=next_row.alertas_activas,alertas_email=next_row.alertas_email,alertas_whatsapp=next_row.alertas_whatsapp,alertas_telegram=next_row.alertas_telegram,updated_at=next_row.updated_at
  WHERE user_id=p_user_id RETURNING * INTO saved;
 ELSE
  INSERT INTO public.user_preferences(user_id,distrito_principal,otros_distritos,cargos,materias,niveles,turnos,alertas_activas,alertas_email,alertas_whatsapp,alertas_telegram,updated_at)
  VALUES(p_user_id,next_row.distrito_principal,next_row.otros_distritos,next_row.cargos,next_row.materias,next_row.niveles,next_row.turnos,next_row.alertas_activas,next_row.alertas_email,next_row.alertas_whatsapp,next_row.alertas_telegram,next_row.updated_at)
  ON CONFLICT(user_id) DO NOTHING RETURNING * INTO saved;
 END IF;
 IF saved.user_id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','conflict'); END IF;
 RETURN jsonb_build_object('ok',true,'preferences',to_jsonb(saved));
END $f$;
REVOKE ALL ON FUNCTION public.apd_save_free_preferences(uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apd_save_free_preferences(uuid,jsonb,jsonb) TO service_role;
COMMIT;
