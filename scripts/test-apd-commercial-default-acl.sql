DO $acl$
DECLARE rel text; role_name text; perm text;
BEGIN
 FOREACH rel IN ARRAY ARRAY['apd_commercial_release_control','apd_complete_trial_claims','apd_complete_payment_ledger','apd_complete_payment_review'] LOOP
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
   FOREACH perm IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    IF has_table_privilege(role_name,'public.'||rel,perm) THEN RAISE EXCEPTION 'Public role % retains % on %',role_name,perm,rel; END IF;
   END LOOP;
  END LOOP;
  FOREACH perm IN ARRAY ARRAY['DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
   IF has_table_privilege('service_role','public.'||rel,perm) THEN RAISE EXCEPTION 'Service role retains % on %',perm,rel; END IF;
  END LOOP;
  IF NOT has_table_privilege('service_role','public.'||rel,'SELECT') THEN RAISE EXCEPTION 'Missing service read %',rel; END IF;
 END LOOP;
 IF has_table_privilege('service_role','public.apd_commercial_release_control','INSERT') OR has_table_privilege('service_role','public.apd_commercial_release_control','UPDATE') OR has_table_privilege('service_role','public.apd_complete_trial_claims','UPDATE')
 THEN RAISE EXCEPTION 'Excess release/claim privilege'; END IF;
END $acl$;
