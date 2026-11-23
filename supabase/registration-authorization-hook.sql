-- NOTEBOOK SCUOLA
-- Ticket monouso per autorizzare la creazione di un account.
--
-- PREREQUISITO:
-- La tabella public.parental_consent_requests deve gia' esistere.
-- Questo script NON va eseguito finche' non abbiamo completato e verificato
-- tutte le API di emissione dei ticket e il flusso di conferma.
--
-- Dopo l'esecuzione, il Before User Created Hook di Supabase dovra' essere
-- associato a:
-- pg-functions://postgres/public/hook_validate_registration_authorization

DO $$
BEGIN
  IF to_regclass('public.parental_consent_requests') IS NULL THEN
    RAISE EXCEPTION
      'Manca public.parental_consent_requests: creare prima la tabella delle richieste di consenso genitoriale.';
  END IF;
END;
$$;

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

CREATE INDEX IF NOT EXISTS registration_authorizations_expiry_idx
  ON public.registration_authorizations (expires_at)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS registration_authorizations_parent_request_idx
  ON public.registration_authorizations (parental_consent_request_id)
  WHERE parental_consent_request_id IS NOT NULL;

-- Un solo ticket ancora utilizzabile per indirizzo email.
-- Le API dovranno revocare l'eventuale ticket precedente prima di emetterne uno nuovo.
CREATE UNIQUE INDEX IF NOT EXISTS registration_authorizations_one_active_email_uidx
  ON public.registration_authorizations (lower(student_email))
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

ALTER TABLE public.registration_authorizations ENABLE ROW LEVEL SECURITY;

-- Nessun accesso diretto dal browser. Le API server-side useranno service_role.
REVOKE ALL ON TABLE public.registration_authorizations
  FROM PUBLIC, anon, authenticated, supabase_auth_admin;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.registration_authorizations
  TO service_role;

-- Supabase Auth esegue questa funzione prima di inserire il nuovo utente.
-- Il ticket e' un UUID casuale monouso: viene confrontato atomicamente con
-- l'email e consumato nella stessa operazione, impedendo il riutilizzo.
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

  -- Notebook Scuola usa la registrazione email/password.
  -- Gli altri provider non devono poter aggirare il flusso autorizzativo.
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

  -- L'UPDATE condizionale rende il consumo monouso anche con richieste simultanee.
  -- Per i minori di 14 anni viene ricontrollato lo stato effettivo del consenso.
  UPDATE public.registration_authorizations AS ra
  SET consumed_at = pg_catalog.now()
  WHERE ra.id = v_ticket_id
    AND ra.student_email = v_email
    AND ra.expires_at > pg_catalog.now()
    AND ra.consumed_at IS NULL
    AND ra.revoked_at IS NULL
    AND (
      ra.authorization_type = 'age_14_plus'
      OR (
        ra.authorization_type = 'parental_consent'
        AND EXISTS (
          SELECT 1
          FROM public.parental_consent_requests AS consent
          WHERE consent.id = ra.parental_consent_request_id
            AND lower(btrim(consent.child_email)) = v_email
            AND consent.status IN ('approved', 'invite_sent')
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

-- Solo il ruolo interno usato da Supabase Auth puo' invocare l'hook.
GRANT EXECUTE
  ON FUNCTION public.hook_validate_registration_authorization(jsonb)
  TO supabase_auth_admin;

REVOKE EXECUTE
  ON FUNCTION public.hook_validate_registration_authorization(jsonb)
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.registration_authorizations IS
  'Ticket monouso server-side che autorizzano la creazione di un account Notebook Scuola.';

COMMENT ON FUNCTION public.hook_validate_registration_authorization(jsonb) IS
  'Supabase Before User Created Hook: rifiuta ogni signup senza ticket valido, associato all''email e non ancora consumato.';
