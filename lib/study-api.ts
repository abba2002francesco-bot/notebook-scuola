// Configurazione pubblica del database isolato per l'area Studio.
 // La chiave è un publishable key: non concede privilegi amministrativi.
export const STUDY_SUPABASE_URL = "https://bgdocyhfcejbutnvsyxl.supabase.co";
export const STUDY_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_kEIbgTwCiGPH9gz925FbPw_ZkVsOxgG";
export const STUDY_API_WORKSPACES_URL = `${STUDY_SUPABASE_URL}/functions/v1/study-api/workspaces`;
export const STUDY_API_SOURCES_URL = `${STUDY_SUPABASE_URL}/functions/v1/study-api/sources`;
export const STUDY_API_NOTES_URL = `${STUDY_SUPABASE_URL}/functions/v1/study-api/notes`;

export const STUDY_API_CONVERSATIONS_URL = `${STUDY_SUPABASE_URL}/functions/v1/study-api/conversations`;
export const STUDY_API_MESSAGES_URL = `${STUDY_SUPABASE_URL}/functions/v1/study-api/messages`;
export const STUDY_API_BOOKMARKS_URL = `${STUDY_SUPABASE_URL}/functions/v1/study-api/bookmarks`;
