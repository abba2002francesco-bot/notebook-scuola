-- NOTEBOOK SCUOLA
-- Ticket monouso e controlli server-side per la registrazione.
--
-- PREREQUISITO:
-- La tabella public.parental_consent_requests deve gia' esistere.
-- Questo script NON va eseguito finche' non e' stato verificato il flusso
-- applicativo e concordata l'attivazione del Before User Created Hook.
--
-- Funzione da selezionare in Supabase > Authentication > Hooks:
-- pg-functions://postgres/public/hook_validate_registration_authorization

DO $$
BEGIN
  IF to_regclass('public.parental_consent_requests') IS NULL THEN
    RAISE EXCEPTION
      'Manca public.parental_consent_requests: creare prima la tabella delle richieste di consenso genitoriale.';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Ticket monouso che autorizzano la creazione di un account Auth.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.registration_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_email text NOT NULL,
  authorization_type text NOT NULL
    CHECK (authorization_type IN ('age_14_plus', 'parental_consent')),
  parental_consent_request_id uuid
    REFERENCES public.parental_consent_requests(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  consumed_by_auth_user_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT registration_authorizations_email_normalized
    CHECK (student_email = lower(btrim(student_email))),
  CONSTRAINT registration_authorizations_email_not_empty
    CHECK (char_length(student_email) BETWEEN 3 AND 254),
  CONSTRAINT registration_authorizations_expiry_after_creation
    CHECK (expires_at > created_at),
  CONSTRAINT registration_authorizations_type_request_match
    CHECK (
      (authorization_type = 'age_14_plus' AND parental_consent_request_id IS NULL)
      OR
      (authorization_type = 'parental_consent' AND parental_consent_request_id IS NOT NULL)
    ),
  CONSTRAINT registration_authorizations_not_consumed_and_revoked
    CHECK (NOT (consumed_at IS NOT NULL AND revoked_at IS NOT NULL))
);

-- Compatibilita' con un'eventuale tabella gia' creata in una prima revisione.
ALTER TABLE public.registration_authorizations
  ADD COLUMN IF NOT EXISTS consumed_by_auth_user_id uuid
  REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS registration_authorizations_expiry_idx
  ON public.registration_authorizations (expires_at)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS registration_authorizations_parent_request_idx
  ON public.registration_authorizations (parental_consent_request_id)
  WHERE parental_consent_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS registration_authorizations_consumed_user_idx
  ON public.registration_authorizations (consumed_by_auth_user_id)
  WHERE consumed_by_auth_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS registration_authorizations_one_active_email_uidx
  ON public.registration_authorizations (lower(student_email))
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

ALTER TABLE public.registration_authorizations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.registration_authorizations
  FROM PUBLIC, anon, authenticated, supabase_auth_admin;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.registration_authorizations
  TO service_role;

COMMENT ON TABLE public.registration_authorizations IS
  'Ticket monouso server-side che autorizzano la creazione di un account Notebook Scuola.';

-- ---------------------------------------------------------------------------
-- Rate limit per prevenire invii email automatici e ripetuti.
-- Le chiavi sono hash SHA-256 di IP/email; gli IP grezzi non vengono salvati.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.registration_rate_limit_buckets (
  bucket_key text PRIMARY KEY
    CHECK (bucket_key ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS registration_rate_limit_updated_idx
  ON public.registration_rate_limit_buckets (updated_at);

ALTER TABLE public.registration_rate_limit_buckets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.registration_rate_limit_buckets
  FROM PUBLIC, anon, authenticated, supabase_auth_admin;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.registration_rate_limit_buckets
  TO service_role;

CREATE OR REPLACE FUNCTION public.take_registration_rate_limit(
  p_keys text[],
  p_max_requests integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_key text;
  v_count integer;
  v_allowed boolean := true;
  v_now timestamptz := pg_catalog.now();
  v_window interval;
BEGIN
  IF p_keys IS NULL
     OR pg_catalog.cardinality(p_keys) = 0
     OR p_max_requests < 1
     OR p_max_requests > 100
     OR p_window_seconds < 1
     OR p_window_seconds > 86400 THEN
    RETURN false;
  END IF;

  v_window := pg_catalog.make_interval(secs => p_window_seconds::double precision);

  FOREACH v_key IN ARRAY p_keys LOOP
    IF v_key IS NULL OR v_key !~ '^[a-f0-9]{64}$' THEN
      RETURN false;
    END IF;

    INSERT INTO public.registration_rate_limit_buckets AS bucket
      (bucket_key, window_started_at, request_count, updated_at)
    VALUES
      (v_key, v_now, 1, v_now)
    ON CONFLICT (bucket_key) DO UPDATE
    SET
      window_started_at = CASE
        WHEN bucket.window_started_at <= v_now - v_window THEN v_now
        ELSE bucket.window_started_at
      END,
      request_count = CASE
        WHEN bucket.window_started_at <= v_now - v_window THEN 1
        ELSE bucket.request_count + 1
      END,
      updated_at = v_now
    RETURNING request_count INTO v_count;

    IF v_count > p_max_requests THEN
      v_allowed := false;
    END IF;
  END LOOP;

  DELETE FROM public.registration_rate_limit_buckets
  WHERE updated_at < v_now - interval '48 hours';

  RETURN v_allowed;
END;
$function$;

REVOKE EXECUTE
  ON FUNCTION public.take_registration_rate_limit(text[], integer, integer)
  FROM PUBLIC, anon, authenticated, supabase_auth_admin;

GRANT EXECUTE
  ON FUNCTION public.take_registration_rate_limit(text[], integer, integer)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Supabase Before User Created Hook.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.hook_validate_registration_authorization(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_email text;
  v_provider text;
  v_ticket_text text;
  v_ticket_id uuid;
  v_consumed_id uuid;
BEGIN
  v_email := lower(btrim(coalesce(event #>> '{user,email}', '')));
  v_provider := coalesce(event #>> '{user,app_metadata,provider}', '');
  v_ticket_text := nullif(btrim(event #>> '{user,user_metadata,registration_ticket}'), '');

  IF v_provider <> 'email' THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object(
        'http_code', 403,
        'message', 'Per creare un account Notebook Scuola devi usare la procedura di registrazione del sito.'
      )
    );
  END IF;

  IF v_email = '' OR v_ticket_text IS NULL
     OR v_ticket_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object(
        'http_code', 403,
        'message', 'Registrazione non autorizzata. Ripeti la procedura dal sito Notebook Scuola.'
      )
    );
  END IF;

  v_ticket_id := v_ticket_text::uuid;

  -- L'UPDATE condizionale consuma il ticket una sola volta, anche in caso
  -- di richieste simultanee. Per gli under 14 il consenso viene ricontrollato.
  UPDATE public.registration_authorizations AS ra
  SET consumed_at = pg_catalog.now()
  WHERE ra.id = v_ticket_id
    AND ra.student_email = v_email
    AND ra.expires_at > pg_catalog.now()
    AND ra.consumed_at IS NULL
    AND ra.revoked_at IS NULL
    AND (
      (
        ra.authorization_type = 'age_14_plus'
        AND NOT EXISTS (
          SELECT 1
          FROM public.parental_consent_requests AS pending_consent
          WHERE lower(btrim(pending_consent.child_email)) = v_email
            AND pending_consent.status IN ('pending', 'approved', 'invite_sent', 'invite_failed')
            AND pending_consent.expires_at > pg_catalog.now()
        )
      )
      OR (
        ra.authorization_type = 'parental_consent'
        AND EXISTS (
          SELECT 1
          FROM public.parental_consent_requests AS consent
          WHERE consent.id = ra.parental_consent_request_id
            AND lower(btrim(consent.child_email)) = v_email
            AND consent.status IN ('approved', 'invite_sent', 'invite_failed')
            AND consent.guardian_declaration_accepted IS TRUE
            AND consent.approved_at IS NOT NULL
            AND consent.expires_at > pg_catalog.now()
        )
      )
    )
  RETURNING ra.id INTO v_consumed_id;

  IF v_consumed_id IS NULL THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object(
        'http_code', 403,
        'message', 'Autorizzazione assente, scaduta o non piu'' valida. Ripeti la procedura dal sito Notebook Scuola.'
      )
    );
  END IF;

  RETURN '{}'::jsonb;
END;
$function$;

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

GRANT EXECUTE
  ON FUNCTION public.hook_validate_registration_authorization(jsonb)
  TO supabase_auth_admin;

REVOKE EXECUTE
  ON FUNCTION public.hook_validate_registration_authorization(jsonb)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.hook_validate_registration_authorization(jsonb) IS
  'Supabase Before User Created Hook: rifiuta ogni signup senza ticket valido, associato all''email e non ancora consumato.';

-- ---------------------------------------------------------------------------
-- Collega il ticket all'utente creato e lo rimuove dai metadati Auth.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.link_registration_authorization_to_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_ticket_text text;
  v_ticket_id uuid;
  v_parent_request_id uuid;
BEGIN
  v_ticket_text := nullif(NEW.raw_user_meta_data->>'registration_ticket', '');

  IF v_ticket_text IS NOT NULL
     AND v_ticket_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_ticket_id := v_ticket_text::uuid;

    UPDATE public.registration_authorizations AS ra
    SET consumed_by_auth_user_id = NEW.id
    WHERE ra.id = v_ticket_id
      AND ra.student_email = lower(coalesce(NEW.email, ''))
      AND ra.consumed_at IS NOT NULL
      AND ra.consumed_by_auth_user_id IS NULL
    RETURNING ra.parental_consent_request_id INTO v_parent_request_id;

    IF v_parent_request_id IS NOT NULL THEN
      UPDATE public.parental_consent_requests AS consent
      SET auth_user_id = NEW.id
      WHERE consent.id = v_parent_request_id
        AND lower(btrim(consent.child_email)) = lower(coalesce(NEW.email, ''))
        AND consent.guardian_declaration_accepted IS TRUE
        AND consent.approved_at IS NOT NULL;
    END IF;
  END IF;

  IF coalesce(NEW.raw_user_meta_data, '{}'::jsonb) ? 'registration_ticket' THEN
    UPDATE auth.users
    SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'registration_ticket'
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE
  ON FUNCTION public.link_registration_authorization_to_new_user()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_registration_authorization_user_created ON auth.users;

CREATE TRIGGER on_registration_authorization_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.link_registration_authorization_to_new_user();
