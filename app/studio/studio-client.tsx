"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpen, Bookmark, Check, FileQuestion, FileText, Image, Layers, LoaderCircle, Map, Menu, MessageCircle, Mic, Plus, Presentation, Send, Sparkles, StickyNote, Trash2, Upload, Video, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import { STUDY_SUPABASE_URL, STUDY_SUPABASE_PUBLISHABLE_KEY } from "@/lib/study-api";

type Workspace = {
  id: string;
  title: string;
  subject: string | null;
  education_level: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
};

const SUBJECTS = [
  "Matematica", "Fisica", "Italiano", "Storia", "Inglese", "Filosofia",
  "Chimica", "Biologia", "Informatica", "Economia", "Diritto", "Arte",
  "Geografia", "Scienze", "Altro",
];

const LEVELS = ["Medie", "Superiori", "Università", "Altro"];

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const SOURCE_BUCKET = "study-source-files";
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const studyStorageClient = createClient(STUDY_SUPABASE_URL, STUDY_SUPABASE_PUBLISHABLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

type Source = {
  id: string;
  workspace_id: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  status: "uploaded" | "processing" | "extracted" | "ready" | "failed";
  page_count: number | null;
  extracted_char_count: number;
  chunk_count: number;
  chunked_at: string | null;
  failure_code: string | null;
  created_at: string;
  processed_at: string | null;
};

type StudyNote = {
  id: string;
  workspace_id: string;
  user_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

type NoteEditor = {
  id: string | null;
  title: string;
  content: string;
  originalTitle: string;
  originalContent: string;
};

type StudyConversation = {
  id: string;
  workspace_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type StudyMessage = {
  id: string;
  conversation_id: string;
  workspace_id: string;
  role: "user" | "assistant";
  content: string;
  citations: unknown[];
  model_id: string | null;
  is_bookmarked: boolean;
  bookmarked_at: string | null;
  created_at: string;
};

type StudyBookmark = {
  id: string;
  conversation_id: string;
  workspace_id: string;
  content: string;
  citations: unknown[];
  created_at: string;
  bookmarked_at: string | null;
  conversation_title: string;
};

function formatFileSize(value: number) {
  if (value < 1024 * 1024) return Math.max(1, Math.round(value / 1024)) + " KB";
  return (value / (1024 * 1024)).toFixed(1) + " MB";
}

function formatMessageDate(value: string) {
  return new Date(value).toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sourceStatusLabel(source: Source) {
  if (source.status === "extracted" || source.status === "ready") return "Testo estratto";
  if (source.status === "processing") return "Elaborazione";
  if (source.status === "failed") return "Da riprovare";
  return "Caricato";
}

export default function StudioClient() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("Matematica");
  const [level, setLevel] = useState("Superiori");
  const [description, setDescription] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState("");
  const [chunkingId, setChunkingId] = useState<string | null>(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [mobilePanel, setMobilePanel] = useState<"sources" | "tools" | null>(null);
  const [notes, setNotes] = useState<StudyNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteDeleting, setNoteDeleting] = useState(false);
  const [editingNote, setEditingNote] = useState<NoteEditor | null>(null);
  const [conversations, setConversations] = useState<StudyConversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<StudyMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [bookmarks, setBookmarks] = useState<StudyBookmark[]>([]);
  const [bookmarksLoading, setBookmarksLoading] = useState(false);
  const [bookmarkBusyId, setBookmarkBusyId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const getAccessToken = useCallback(async () => {
    if (!supabase) throw new Error("Supabase non è configurato.");
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session?.access_token) {
      throw new Error("La sessione è scaduta. Accedi nuovamente.");
    }
    return data.session.access_token;
  }, []);

  const loadWorkspaces = useCallback(async () => {
    setListLoading(true);
    setError("");
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/studio/workspaces", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({})) as {
        workspaces?: Workspace[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "Non è stato possibile caricare i notebook.");
      setWorkspaces(result.workspaces ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Errore durante il caricamento.");
    } finally {
      setListLoading(false);
    }
  }, [getAccessToken]);

  const loadSources = useCallback(async (workspaceId: string) => {
    setSourcesLoading(true);
    setError("");
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/studio/sources?workspace_id=" + encodeURIComponent(workspaceId), {
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({})) as { sources?: Source[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Non è stato possibile caricare i documenti.");
      const nextSources = result.sources ?? [];
      setSources(nextSources);
      setSelectedSourceIds((current) => current.filter((id) => nextSources.some((source) => source.id === id)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Errore durante il caricamento dei documenti.");
    } finally {
      setSourcesLoading(false);
    }
  }, [getAccessToken]);


  const loadNotes = useCallback(async (workspaceId: string) => {
    setNotesLoading(true);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/studio/notes?workspace_id=" + encodeURIComponent(workspaceId), {
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({})) as { notes?: StudyNote[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Non è stato possibile caricare le note.");
      setNotes(result.notes ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Errore durante il caricamento delle note.");
    } finally {
      setNotesLoading(false);
    }
  }, [getAccessToken]);


  const loadConversations = useCallback(async (workspaceId: string) => {
    setConversationsLoading(true);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/studio/conversations?workspace_id=" + encodeURIComponent(workspaceId), {
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({})) as {
        conversations?: StudyConversation[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "Non è stato possibile caricare la cronologia.");
      const next = result.conversations ?? [];
      setConversations(next);
      setActiveConversationId((current) => current && next.some((item) => item.id === current)
        ? current
        : next[0]?.id ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Errore durante il caricamento della cronologia.");
    } finally {
      setConversationsLoading(false);
    }
  }, [getAccessToken]);

  const loadMessages = useCallback(async (conversationId: string) => {
    setMessagesLoading(true);
    setMessages([]);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/studio/messages?conversation_id=" + encodeURIComponent(conversationId), {
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({})) as {
        messages?: StudyMessage[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "Non è stato possibile caricare i messaggi.");
      setMessages(result.messages ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Errore durante il caricamento dei messaggi.");
    } finally {
      setMessagesLoading(false);
    }
  }, [getAccessToken]);

  const loadBookmarks = useCallback(async (workspaceId: string) => {
    setBookmarksLoading(true);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/studio/bookmarks?workspace_id=" + encodeURIComponent(workspaceId), {
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({})) as {
        bookmarks?: StudyBookmark[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "Non è stato possibile caricare i segnalibri.");
      setBookmarks(result.bookmarks ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Errore durante il caricamento dei segnalibri.");
    } finally {
      setBookmarksLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/accedi?next=/studio");
      return;
    }
    void loadWorkspaces();
  }, [loading, user, router, loadWorkspaces]);

  useEffect(() => {
    if (!selectedWorkspaceId || !user || loading) {
      setSources([]);
      setNotes([]);
      setEditingNote(null);
      setConversations([]);
      setActiveConversationId(null);
      setMessages([]);
      setBookmarks([]);
      return;
    }
    void loadSources(selectedWorkspaceId);
    void loadNotes(selectedWorkspaceId);
    void loadConversations(selectedWorkspaceId);
    void loadBookmarks(selectedWorkspaceId);
  }, [selectedWorkspaceId, user, loading, loadSources, loadNotes, loadConversations, loadBookmarks]);

  useEffect(() => {
    if (!activeConversationId || !selectedWorkspaceId || !user || loading) {
      setMessages([]);
      return;
    }
    void loadMessages(activeConversationId);
  }, [activeConversationId, selectedWorkspaceId, user, loading, loadMessages]);

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/studio/workspaces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          subject: subject || null,
          education_level: level || null,
          description: description.trim() || null,
        }),
      });
      const result = await response.json().catch(() => ({})) as {
        workspace?: Workspace;
        error?: string;
      };
      if (!response.ok || !result.workspace) {
        throw new Error(result.error || "Non è stato possibile creare il notebook.");
      }
      setWorkspaces((current) => [result.workspace!, ...current]);
      setSelectedWorkspaceId(result.workspace!.id);
      setTitle("");
      setSubject("Matematica");
      setLevel("Superiori");
      setDescription("");
      setShowCreateForm(false);
      setSuccess("Notebook personale creato.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Creazione non riuscita.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteWorkspace(workspace: Workspace) {
    const confirmed = window.confirm(`Vuoi eliminare "${workspace.title}"? Questa operazione eliminerà anche le fonti e le conversazioni collegate.`);
    if (!confirmed) return;

    setError("");
    setSuccess("");
    setDeletingId(workspace.id);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/studio/workspaces", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ workspace_id: workspace.id }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Eliminazione non riuscita.");
      setWorkspaces((current) => current.filter((item) => item.id !== workspace.id));
      if (selectedWorkspaceId === workspace.id) {
        setSelectedWorkspaceId(null);
        setSources([]);
        setNotes([]);
        setEditingNote(null);
      }
      setSuccess("Notebook eliminato.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Eliminazione non riuscita.");
    } finally {
      setDeletingId(null);
    }
  }

  async function uploadSource(file: File) {
    if (!selectedWorkspaceId) {
      setError("Seleziona prima un notebook.");
      return;
    }

    const extension = file.name.toLowerCase().split(".").pop() || "";
    const mimeType = MIME_BY_EXTENSION[extension];
    if (!mimeType) {
      setError("Formato non supportato. Puoi caricare PDF, DOCX o PPTX.");
      return;
    }
    if (file.size < 1 || file.size > MAX_FILE_BYTES) {
      setError("Il file deve pesare al massimo 20 MB.");
      return;
    }

    setError("");
    setSuccess("");
    setUploading(true);

    try {
      const token = await getAccessToken();
      setUploadStage("Preparazione del caricamento…");

      const prepareResponse = await fetch("/api/studio/sources", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          workspace_id: selectedWorkspaceId,
          filename: file.name,
          mime_type: mimeType,
          byte_size: file.size,
        }),
      });
      const prepared = await prepareResponse.json().catch(() => ({})) as {
        source?: Source;
        upload?: { path: string; token: string };
        error?: string;
      };

      if (!prepareResponse.ok || !prepared.source || !prepared.upload?.path || !prepared.upload.token) {
        throw new Error(prepared.error || "Non è stato possibile preparare il caricamento.");
      }

      setUploadStage("Caricamento del file…");
      const { error: storageError } = await studyStorageClient.storage
        .from(SOURCE_BUCKET)
        .uploadToSignedUrl(prepared.upload.path, prepared.upload.token, file, {
          contentType: mimeType,
          upsert: false,
        });

      if (storageError) {
        await fetch("/api/studio/sources", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({ source_id: prepared.source.id }),
        }).catch(() => undefined);
        throw new Error("Il caricamento del file non è riuscito: " + storageError.message);
      }

      setUploadStage("Estrazione del testo e delle pagine…");
      const processResponse = await fetch("/api/studio/sources/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ source_id: prepared.source.id }),
      });
      const processed = await processResponse.json().catch(() => ({})) as { error?: string };

      await loadSources(selectedWorkspaceId);
      if (!processResponse.ok) {
        throw new Error(processed.error || "Il file è stato caricato ma l'estrazione non è riuscita.");
      }

      setSuccess("Documento caricato e testo estratto. L'indice semantico e l'assistente AI saranno aggiunti nella fase successiva.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Caricamento non riuscito.");
      if (selectedWorkspaceId) await loadSources(selectedWorkspaceId);
    } finally {
      setUploading(false);
      setUploadStage("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }


  async function prepareSourceChunks(source: Source) {
    if (source.status !== "extracted") return;

    setError("");
    setSuccess("");
    setChunkingId(source.id);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/studio/sources/chunk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ source_id: source.id }),
      });
      const result = await response.json().catch(() => ({})) as {
        chunk_count?: number;
        error?: string;
        embedding_status?: string;
      };

      if (!response.ok || !Number.isInteger(result.chunk_count)) {
        throw new Error(result.error || "Non è stato possibile creare i segmenti.");
      }

      if (selectedWorkspaceId) await loadSources(selectedWorkspaceId);
      setSuccess(
        "Testo suddiviso in " + result.chunk_count +
        " segmenti con riferimenti alle pagine. Nessuna chiamata AI o costo per modelli."
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Preparazione dei segmenti non riuscita.");
    } finally {
      setChunkingId(null);
    }
  }

  async function deleteSource(source: Source) {
    const confirmed = window.confirm("Vuoi eliminare il documento \"" + source.original_filename + "\" e il testo estratto?");
    if (!confirmed) return;

    setError("");
    setSuccess("");
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/studio/sources", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ source_id: source.id }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Eliminazione non riuscita.");
      if (selectedWorkspaceId) await loadSources(selectedWorkspaceId);
      setSuccess("Documento eliminato.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Eliminazione non riuscita.");
    }
  }

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) ?? null;
  const selectedSourcesCount = selectedSourceIds.length;
  const chunkedSourcesCount = sources.filter((source) => source.chunk_count > 0).length;
  const readySourcesCount = sources.filter((source) => source.status === "extracted" || source.status === "ready").length;

  function openWorkspace(workspaceId: string) {
    setSelectedSourceIds([]);
    setSources([]);
    setNotes([]);
    setEditingNote(null);
    setConversations([]);
    setActiveConversationId(null);
    setMessages([]);
    setBookmarks([]);
    setMobilePanel(null);
    setError("");
    setSuccess("");
    setSelectedWorkspaceId(workspaceId);
  }

  function closeWorkspace() {
    setSelectedWorkspaceId(null);
    setSelectedSourceIds([]);
    setSources([]);
    setNotes([]);
    setEditingNote(null);
    setConversations([]);
    setActiveConversationId(null);
    setMessages([]);
    setBookmarks([]);
    setMobilePanel(null);
    setError("");
    setSuccess("");
  }


  async function createConversation() {
    if (!selectedWorkspaceId) return;
    setError("");
    setSuccess("");
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/studio/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ workspace_id: selectedWorkspaceId }),
      });
      const result = await response.json().catch(() => ({})) as {
        conversation?: StudyConversation;
        error?: string;
      };
      if (!response.ok || !result.conversation) {
        throw new Error(result.error || "Non è stato possibile creare una conversazione.");
      }
      setConversations((current) => [result.conversation!, ...current]);
      setActiveConversationId(result.conversation.id);
      setMessages([]);
      setMobilePanel(null);
      setSuccess("Nuova conversazione creata e salvata.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Creazione della conversazione non riuscita.");
    }
  }

  async function deleteConversation() {
    const conversation = conversations.find((item) => item.id === activeConversationId);
    if (!conversation) return;
    if (!window.confirm("Vuoi eliminare questa conversazione e i relativi messaggi? Le note e le fonti del notebook resteranno intatte.")) return;

    setError("");
    setSuccess("");
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/studio/conversations", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ conversation_id: conversation.id }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Non è stato possibile eliminare la conversazione.");
      const remaining = conversations.filter((item) => item.id !== conversation.id);
      setConversations(remaining);
      setActiveConversationId(remaining[0]?.id ?? null);
      setMessages([]);
      if (selectedWorkspaceId) await loadBookmarks(selectedWorkspaceId);
      setSuccess("Conversazione eliminata.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Eliminazione della conversazione non riuscita.");
    }
  }

  async function toggleMessageBookmark(message: StudyMessage) {
    if (message.role !== "assistant" || bookmarkBusyId) return;
    setBookmarkBusyId(message.id);
    setError("");
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/studio/messages", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          message_id: message.id,
          is_bookmarked: !message.is_bookmarked,
        }),
      });
      const result = await response.json().catch(() => ({})) as { message?: StudyMessage; error?: string };
      if (!response.ok || !result.message) {
        throw new Error(result.error || "Non è stato possibile aggiornare il segnalibro.");
      }
      setMessages((current) => current.map((item) => item.id === message.id ? result.message! : item));
      if (selectedWorkspaceId) await loadBookmarks(selectedWorkspaceId);
      setSuccess(result.message.is_bookmarked ? "Risposta aggiunta ai segnalibri." : "Risposta rimossa dai segnalibri.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Aggiornamento del segnalibro non riuscito.");
    } finally {
      setBookmarkBusyId(null);
    }
  }

  function openBookmark(bookmark: StudyBookmark) {
    setActiveConversationId(bookmark.conversation_id);
    setMobilePanel(null);
    setSuccess("Conversazione originale aperta: " + bookmark.conversation_title);
  }

  function startNewNote() {
    setEditingNote({
      id: null,
      title: "",
      content: "",
      originalTitle: "",
      originalContent: "",
    });
  }

  function openNote(note: StudyNote) {
    setEditingNote({
      id: note.id,
      title: note.title,
      content: note.content,
      originalTitle: note.title,
      originalContent: note.content,
    });
  }

  function closeNoteEditor() {
    if (!editingNote) return;
    const dirty = editingNote.title !== editingNote.originalTitle ||
      editingNote.content !== editingNote.originalContent;
    if (dirty && !window.confirm("Ci sono modifiche non salvate. Vuoi chiudere senza salvarle?")) return;
    setEditingNote(null);
  }

  async function saveNote() {
    if (!editingNote || !selectedWorkspaceId) return;
    const cleanTitle = editingNote.title.trim();
    if (!cleanTitle) {
      setError("Inserisci un titolo per la nota.");
      return;
    }
    if (editingNote.content.length > 50_000) {
      setError("La nota supera il limite di 50.000 caratteri.");
      return;
    }

    setError("");
    setSuccess("");
    setNoteSaving(true);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/studio/notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          workspace_id: selectedWorkspaceId,
          ...(editingNote.id ? { note_id: editingNote.id } : {}),
          title: cleanTitle,
          content: editingNote.content,
        }),
      });
      const result = await response.json().catch(() => ({})) as { note?: StudyNote; error?: string };
      if (!response.ok || !result.note) {
        throw new Error(result.error || "Non è stato possibile salvare la nota.");
      }

      const savedNote = result.note;
      setNotes((current) => [
        savedNote,
        ...current.filter((item) => item.id !== savedNote.id),
      ].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)));
      setEditingNote({
        id: savedNote.id,
        title: savedNote.title,
        content: savedNote.content,
        originalTitle: savedNote.title,
        originalContent: savedNote.content,
      });
      setSuccess("Nota salvata in questo notebook.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Salvataggio della nota non riuscito.");
    } finally {
      setNoteSaving(false);
    }
  }

  async function deleteNote() {
    if (!editingNote?.id) {
      setEditingNote(null);
      return;
    }
    const confirmed = window.confirm("Vuoi eliminare definitivamente questa nota?");
    if (!confirmed) return;

    setError("");
    setSuccess("");
    setNoteDeleting(true);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/studio/notes", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ note_id: editingNote.id }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Non è stato possibile eliminare la nota.");
      setNotes((current) => current.filter((note) => note.id !== editingNote.id));
      setEditingNote(null);
      setSuccess("Nota eliminata.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Eliminazione della nota non riuscita.");
    } finally {
      setNoteDeleting(false);
    }
  }

  if (loading || (user && listLoading && workspaces.length === 0)) {
    return <div className="container page"><div className="loading">Caricamento area studio…</div></div>;
  }

  if (!user) {
    return <div className="container page"><div className="loading">Reindirizzamento all'accesso…</div></div>;
  }

  if (!selectedWorkspace) {
    return (
      <div className="studio-page studio-home">
        <div className="studio-home-header">
          <div>
            <span className="studio-kicker"><BookOpen size={15} /> NOTEBOOK SCUOLA · STUDIO</span>
            <h1>Il tuo spazio di studio.</h1>
            <p>Un ambiente personale per raccogliere le fonti e costruire il tuo metodo di studio.</p>
          </div>
          <div className="studio-home-header-actions">
            <Link href="/" className="button button-secondary"><ArrowLeft size={15} /> Catalogo</Link>
            <button type="button" className="button button-primary" onClick={() => { setShowCreateForm((value) => !value); setError(""); setSuccess(""); }}>
              <Plus size={16} /> Nuovo notebook
            </button>
          </div>
        </div>

        <div className="studio-home-notice">
          <Sparkles size={17} />
          <span>La beta privata consente fino a 5 notebook personali. La chat AI e gli strumenti di generazione saranno attivati dopo il collaudo del modello e dei costi.</span>
        </div>

        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {success && <div className="alert alert-success" role="status">{success}</div>}

        {showCreateForm && (
          <section className="panel studio-create-panel">
            <div className="studio-section-heading">
              <div>
                <span className="studio-kicker">NUOVO SPAZIO</span>
                <h2>Crea un notebook</h2>
              </div>
              <button type="button" className="icon-button" aria-label="Chiudi il modulo" onClick={() => setShowCreateForm(false)}><X size={17} /></button>
            </div>
            <form onSubmit={createWorkspace} className="studio-create-form">
              <div className="field full">
                <label htmlFor="study-title">Nome del notebook *</label>
                <input id="study-title" required minLength={1} maxLength={120} placeholder="Es. Analisi matematica — esame" value={title} onChange={(event) => setTitle(event.target.value)} />
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="study-subject">Materia</label>
                  <select id="study-subject" value={subject} onChange={(event) => setSubject(event.target.value)}>
                    {SUBJECTS.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="study-level">Livello</label>
                  <select id="study-level" value={level} onChange={(event) => setLevel(event.target.value)}>
                    {LEVELS.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
              </div>
              <div className="field full">
                <label htmlFor="study-description">Descrizione (facoltativa)</label>
                <textarea id="study-description" maxLength={1200} rows={3} placeholder="Quali argomenti vuoi studiare?" value={description} onChange={(event) => setDescription(event.target.value)} />
              </div>
              <div className="form-actions">
                <button type="button" className="button button-secondary" onClick={() => setShowCreateForm(false)}>Annulla</button>
                <button type="submit" className="button button-primary" disabled={saving}>
                  {saving ? <LoaderCircle size={16} /> : <Plus size={16} />}
                  {saving ? "Creazione…" : "Crea notebook"}
                </button>
              </div>
            </form>
          </section>
        )}

        <div className="studio-home-list-heading">
          <div>
            <span className="studio-kicker">I TUOI CONTENUTI</span>
            <h2>Notebook personali</h2>
          </div>
          <span className="studio-home-count">{workspaces.length} / 5</span>
        </div>

        {listLoading ? (
          <div className="loading">Aggiornamento elenco…</div>
        ) : workspaces.length === 0 ? (
          <div className="studio-home-empty">
            <div className="studio-home-empty-icon"><BookOpen size={26} /></div>
            <h3>Il primo notebook parte da qui</h3>
            <p>Crea uno spazio personale e aggiungi i materiali che vuoi usare per studiare.</p>
            {!showCreateForm && <button type="button" className="button button-primary" onClick={() => setShowCreateForm(true)}><Plus size={16} /> Crea il primo notebook</button>}
          </div>
        ) : (
          <div className="studio-home-grid">
            {workspaces.map((workspace) => (
              <article className="panel studio-home-card" key={workspace.id}>
                <div className="studio-home-card-top">
                  <span className="studio-subject-pill">{workspace.subject || "Materia non impostata"}</span>
                  <button type="button" className="icon-button" aria-label={"Elimina " + workspace.title} title="Elimina notebook" disabled={deletingId === workspace.id} onClick={() => void deleteWorkspace(workspace)}>
                    {deletingId === workspace.id ? <LoaderCircle size={16} /> : <Trash2 size={16} />}
                  </button>
                </div>
                <h3>{workspace.title}</h3>
                <p>{workspace.description || "Spazio personale pronto per le tue fonti di studio."}</p>
                <div className="studio-home-card-meta">
                  <span>{workspace.education_level || "Livello non impostato"}</span>
                  <span>{new Date(workspace.created_at).toLocaleDateString("it-IT")}</span>
                </div>
                <button type="button" className="button button-primary studio-open-button" onClick={() => openWorkspace(workspace.id)}>
                  Apri spazio <ArrowLeft size={15} className="studio-arrow-forward" />
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="studio-page studio-workspace-page">
      <div className="studio-workspace-topbar">
        <div className="studio-brand">
          <Link href="/" className="studio-brand-mark" aria-label="Torna a Notebook Scuola"><BookOpen size={19} /></Link>
          <div className="studio-brand-copy">
            <span>NOTEBOOK SCUOLA</span>
            <strong>Studio</strong>
          </div>
        </div>

        <div className="studio-current-notebook">
          <span className="studio-current-subject">{selectedWorkspace.subject || "Studio personale"}</span>
          <strong>{selectedWorkspace.title}</strong>
          <span className="studio-current-level">{selectedWorkspace.education_level || "Notebook personale"}</span>
        </div>

        <div className="studio-topbar-actions">
          <button type="button" className="studio-topbar-button studio-mobile-only" onClick={() => setMobilePanel("sources")} aria-label="Apri pannello fonti">
            <Menu size={17} /><span>Fonti</span>
          </button>
          <button type="button" className="studio-topbar-button studio-mobile-only" onClick={() => setMobilePanel("tools")} aria-label="Apri pannello Studio">
            <Sparkles size={17} /><span>Studio</span>
          </button>
          <button type="button" className="studio-back-button" onClick={closeWorkspace}><ArrowLeft size={15} /><span>Tutti i notebook</span></button>
        </div>
      </div>

      {(error || success) && (
        <div className="studio-flash-messages">
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          {success && <div className="alert alert-success" role="status">{success}</div>}
        </div>
      )}

      {mobilePanel && <button type="button" className="studio-drawer-backdrop" aria-label="Chiudi il pannello" onClick={() => setMobilePanel(null)} />}

      <div className="studio-three-panel-layout">
        <aside className={"studio-side-panel studio-sources-panel" + (mobilePanel === "sources" ? " is-open" : "")} aria-label="Pannello delle fonti">
          <div className="studio-panel-heading">
            <div>
              <span className="studio-kicker">LIBRERIA</span>
              <h2>Fonti</h2>
              <p>{sources.length} documenti nel notebook</p>
            </div>
            <button type="button" className="studio-mobile-close" aria-label="Chiudi fonti" onClick={() => setMobilePanel(null)}><X size={17} /></button>
          </div>

          <button type="button" className="studio-add-source" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? <LoaderCircle size={17} /> : <Plus size={17} />}
            <span>{uploading ? "Caricamento…" : "Aggiungi fonte"}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            hidden
            disabled={uploading}
            onChange={(event) => {
              const selectedFile = event.target.files?.[0];
              if (selectedFile) void uploadSource(selectedFile);
            }}
          />

          {uploading && (
            <div className="studio-upload-progress" role="status">
              <LoaderCircle size={15} /> <span>{uploadStage || "Elaborazione del documento…"}</span>
            </div>
          )}

          <div className="studio-source-toolbar">
            <div className="studio-source-toolbar-title">
              <span>DOCUMENTI</span>
              <span>{sources.length}</span>
            </div>
            <div className="studio-source-toolbar-hint">Seleziona le fonti da usare nella chat</div>
          </div>

          {sourcesLoading ? (
            <div className="studio-panel-loading"><LoaderCircle size={17} /> Caricamento fonti…</div>
          ) : sources.length === 0 ? (
            <div className="studio-source-empty">
              <FileText size={23} />
              <strong>Qui compariranno i tuoi documenti</strong>
              <p>Carica PDF, Word o PowerPoint. I file restano privati nel tuo spazio.</p>
            </div>
          ) : (
            <div className="studio-source-list">
              {sources.map((source) => {
                const selectable = source.status === "extracted" || source.status === "ready";
                const isSelected = selectedSourceIds.includes(source.id);
                return (
                  <article className={"studio-source-card" + (isSelected ? " is-selected" : "")} key={source.id}>
                    <div className="studio-source-card-main">
                      <label className="studio-source-select">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!selectable}
                          onChange={(event) => setSelectedSourceIds((current) => event.target.checked ? [...current, source.id] : current.filter((id) => id !== source.id))}
                        />
                        <span className="studio-source-checkmark"><Check size={12} /></span>
                        <span className="studio-source-file-icon"><FileText size={17} /></span>
                      </label>
                      <div className="studio-source-details">
                        <strong title={source.original_filename}>{source.original_filename}</strong>
                        <span>{formatFileSize(Number(source.byte_size))} · {source.page_count ? (source.mime_type === MIME_BY_EXTENSION.pptx ? source.page_count + " diapositive" : source.page_count + " pagine") : "Pagine n.d."}</span>
                        <div className={"studio-source-status studio-source-status-" + source.status}>{sourceStatusLabel(source)}</div>
                        {source.chunk_count > 0 && <small>{source.chunk_count} segmenti preparati</small>}
                      </div>
                      <button type="button" className="studio-source-delete" title="Elimina documento" aria-label={"Elimina " + source.original_filename} onClick={() => void deleteSource(source)}><Trash2 size={14} /></button>
                    </div>
                    {source.failure_code === "no_text_content" && <p className="studio-source-warning">Non è stato trovato testo selezionabile. I PDF scansionati richiederanno OCR.</p>}
                    {source.status === "extracted" && (
                      <button type="button" className="studio-chunk-button" disabled={chunkingId !== null} onClick={() => void prepareSourceChunks(source)}>
                        {chunkingId === source.id ? <LoaderCircle size={13} /> : <Layers size={13} />}
                        {chunkingId === source.id ? "Preparazione…" : source.chunk_count > 0 ? "Rigenera segmenti" : "Prepara segmenti"}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          <div className="studio-sources-footer">
            <div><strong>{selectedSourcesCount}</strong><span>fonti selezionate</span></div>
            <div><strong>{chunkedSourcesCount}</strong><span>con segmenti</span></div>
          </div>
        </aside>

        <section className="studio-chat-panel" aria-label="Chat di studio">
          <div className="studio-chat-header">
            <div className="studio-chat-heading-icon"><MessageCircle size={18} /></div>
            <div className="studio-chat-heading-copy">
              <span className="studio-kicker">ASSISTENTE DI STUDIO</span>
              <h1>{activeConversation?.title || "Chat"}</h1>
            </div>
            <span className="studio-coming-status"><span /> AI in attivazione</span>
          </div>

          <div className="studio-chat-controls">
            <select
              aria-label="Cronologia delle conversazioni"
              value={activeConversationId ?? ""}
              onChange={(event) => setActiveConversationId(event.target.value || null)}
              disabled={conversationsLoading || conversations.length === 0}
            >
              <option value="">{conversationsLoading ? "Caricamento cronologia…" : "Nessuna conversazione"}</option>
              {conversations.map((conversation) => (
                <option key={conversation.id} value={conversation.id}>{conversation.title}</option>
              ))}
            </select>
            <button type="button" className="studio-chat-new-button" onClick={() => void createConversation()}>
              <Plus size={14} /> Nuova chat
            </button>
            {activeConversation && (
              <button type="button" className="studio-chat-delete-button" title="Elimina conversazione" aria-label="Elimina conversazione" onClick={() => void deleteConversation()}>
                <Trash2 size={15} />
              </button>
            )}
          </div>

          <div className={"studio-chat-content" + (messages.length > 0 ? " has-messages" : "")}>
            {messagesLoading ? (
              <div className="studio-chat-loading"><LoaderCircle size={19} /> Caricamento della conversazione…</div>
            ) : messages.length > 0 ? (
              <div className="studio-message-list">
                {messages.map((message) => (
                  <article className={"studio-message-card " + (message.role === "user" ? "is-user" : "is-assistant")} key={message.id}>
                    <div className="studio-message-meta">
                      <div>
                        <span className="studio-message-role">{message.role === "assistant" ? "Notebook Scuola" : "Tu"}</span>
                        <time dateTime={message.created_at}>{formatMessageDate(message.created_at)}</time>
                      </div>
                      {message.role === "assistant" && (
                        <button
                          type="button"
                          className={"studio-message-bookmark" + (message.is_bookmarked ? " is-active" : "")}
                          aria-label={message.is_bookmarked ? "Rimuovi dai segnalibri" : "Salva nei segnalibri"}
                          title={message.is_bookmarked ? "Rimuovi dai segnalibri" : "Salva nei segnalibri"}
                          disabled={bookmarkBusyId === message.id}
                          onClick={() => void toggleMessageBookmark(message)}
                        >
                          {bookmarkBusyId === message.id ? <LoaderCircle size={15} /> : <Bookmark size={15} fill={message.is_bookmarked ? "currentColor" : "none"} />}
                        </button>
                      )}
                    </div>
                    <div className="studio-message-content">{message.content}</div>
                    {message.citations.length > 0 && (
                      <div className="studio-message-citations">
                        <BookOpen size={13} />
                        {message.citations.length} riferimenti alle fonti
                      </div>
                    )}
                  </article>
                ))}
                <div className="studio-chat-history-footnote">Visualizzati gli ultimi messaggi salvati della conversazione.</div>
              </div>
            ) : (
              <div className="studio-chat-empty-state">
                <div className="studio-chat-welcome">
                  <div className="studio-chat-orb"><Sparkles size={25} /></div>
                  <span className="studio-kicker">IL TUO SPAZIO, LE TUE FONTI</span>
                  <h2>{activeConversation ? "Questa conversazione è pronta." : "Studia con le tue fonti."}<br />Al tuo ritmo.</h2>
                  <p>La cronologia è già predisposta per conservare le domande, le risposte e i riferimenti alle pagine dei tuoi documenti.</p>
                  <div className="studio-chat-metrics">
                    <div><strong>{sources.length}</strong><span>fonti caricate</span></div>
                    <div><strong>{selectedSourcesCount}</strong><span>fonti selezionate</span></div>
                    <div><strong>{chunkedSourcesCount}</strong><span>fonti segmentate</span></div>
                  </div>
                </div>

                <div className="studio-chat-next">
                  <div className="studio-chat-next-icon"><BookOpen size={18} /></div>
                  <div>
                    <strong>{activeConversation ? "Conversazione salvata" : "Inizia creando una conversazione"}</strong>
                    <p>{activeConversation
                      ? "La chat AI non è ancora attiva. Quando verrà collegato il modello, le risposte saranno archiviate qui e potrai salvarle nei segnalibri."
                      : "Crea una nuova conversazione: resterà nella cronologia di questo notebook. Nessuna richiesta viene inviata a un modello AI in questa fase."}</p>
                  </div>
                </div>
                {!activeConversation && (
                  <button type="button" className="button button-primary studio-start-chat-button" onClick={() => void createConversation()}>
                    <Plus size={16} /> Crea la prima conversazione
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="studio-composer">
            <div className="studio-composer-field">
              <textarea disabled rows={1} aria-label="Messaggio per l'assistente" placeholder="La chat AI sarà disponibile dopo l'attivazione del modello…" />
              <button type="button" disabled aria-label="Invia messaggio"><Send size={17} /></button>
            </div>
            <p>Chat e cronologia predisposte · Risposte AI non ancora attive · Nessun costo di generazione</p>
          </div>
        </section>

        <aside className={"studio-side-panel studio-tools-panel" + (mobilePanel === "tools" ? " is-open" : "")} aria-label="Pannello strumenti Studio">
          <div className="studio-panel-heading">
            <div>
              <span className="studio-kicker">CREA E RIPASSA</span>
              <h2><Sparkles size={18} /> Studio</h2>
              <p>Strumenti per trasformare le tue fonti.</p>
            </div>
            <button type="button" className="studio-mobile-close" aria-label="Chiudi strumenti" onClick={() => setMobilePanel(null)}><X size={17} /></button>
          </div>

          <div className="studio-tool-section">
            <div className="studio-tool-section-title"><span>STRUMENTI PRINCIPALI</span><span>6</span></div>
            <div className="studio-tool-grid">
              <div className="studio-tool-card"><div className="studio-tool-icon"><FileText size={18} /></div><strong>Riassunto</strong><span>In arrivo</span></div>
              <div className="studio-tool-card"><div className="studio-tool-icon"><FileQuestion size={18} /></div><strong>Quiz</strong><span>In arrivo</span></div>
              <div className="studio-tool-card"><div className="studio-tool-icon"><Layers size={18} /></div><strong>Flashcard</strong><span>In arrivo</span></div>
              <div className="studio-tool-card"><div className="studio-tool-icon"><Presentation size={18} /></div><strong>Presentazione</strong><span>In arrivo</span></div>
              <div className="studio-tool-card"><div className="studio-tool-icon"><Map size={18} /></div><strong>Mappa concettuale</strong><span>In arrivo</span></div>
              <div className="studio-tool-card"><div className="studio-tool-icon"><StickyNote size={18} /></div><strong>Report</strong><span>In arrivo</span></div>
            </div>
          </div>

          <div className="studio-tool-section">
            <div className="studio-tool-section-title"><span>ALTRI FORMATI</span><span>3</span></div>
            <div className="studio-tool-secondary">
              <div><Mic size={16} /><span>Audio</span><em>In arrivo</em></div>
              <div><Image size={16} /><span>Infografica</span><em>In arrivo</em></div>
              <div><Video size={16} /><span>Video</span><em>In arrivo</em></div>
            </div>
          </div>


          <div className="studio-tool-section studio-notes-section">
            <div className="studio-tool-section-title">
              <span>LE TUE NOTE</span>
              <span>{notes.length}</span>
            </div>
            <button type="button" className="studio-create-note-button" onClick={startNewNote}>
              <Plus size={15} /> Crea una nota
            </button>
            {notesLoading ? (
              <div className="studio-notes-loading"><LoaderCircle size={15} /> Caricamento note…</div>
            ) : notes.length === 0 ? (
              <div className="studio-notes-empty">
                <StickyNote size={19} />
                <span>Gli appunti che scriverai qui resteranno salvati in questo notebook.</span>
              </div>
            ) : (
              <div className="studio-notes-list">
                {notes.map((note) => (
                  <button type="button" className="studio-note-card" key={note.id} onClick={() => openNote(note)}>
                    <strong>{note.title}</strong>
                    <span>{note.content.trim() ? note.content.trim() : "Nota vuota"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>


          <div className="studio-tool-section studio-bookmarks-section">
            <div className="studio-tool-section-title">
              <span>MESSAGGI SALVATI</span>
              <span>{bookmarks.length}</span>
            </div>
            {bookmarksLoading ? (
              <div className="studio-notes-loading"><LoaderCircle size={15} /> Caricamento segnalibri…</div>
            ) : bookmarks.length === 0 ? (
              <div className="studio-notes-empty">
                <Bookmark size={18} />
                <span>Le risposte che salverai dalla chat compariranno qui, collegate alla conversazione originale.</span>
              </div>
            ) : (
              <div className="studio-notes-list">
                {bookmarks.map((bookmark) => (
                  <button type="button" className="studio-bookmark-card" key={bookmark.id} onClick={() => openBookmark(bookmark)}>
                    <div><Bookmark size={12} fill="currentColor" /><strong>{bookmark.conversation_title}</strong></div>
                    <span>{bookmark.content}</span>
                    <time dateTime={bookmark.bookmarked_at ?? bookmark.created_at}>{formatMessageDate(bookmark.bookmarked_at ?? bookmark.created_at)}</time>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="studio-custom-tools-note">
            <div className="studio-custom-tools-icon"><Sparkles size={17} /></div>
            <strong>Comandi personalizzati</strong>
            <p>Stiamo progettando una galleria di comandi predefiniti e la possibilità di crearne di tuoi, senza eseguire codice arbitrario.</p>
            <span>Prossima fase</span>
          </div>
        </aside>
      </div>


      {editingNote && (
        <div className="studio-note-modal-backdrop">
          <section className="studio-note-modal" role="dialog" aria-modal="true" aria-labelledby="studio-note-modal-title">
            <div className="studio-note-modal-header">
              <div>
                <span className="studio-kicker">APPUNTI DEL NOTEBOOK</span>
                <h2 id="studio-note-modal-title">{editingNote.id ? "Modifica nota" : "Nuova nota"}</h2>
              </div>
              <button type="button" className="icon-button" aria-label="Chiudi nota" onClick={closeNoteEditor}><X size={17} /></button>
            </div>
            <div className="studio-note-editor">
              <label htmlFor="studio-note-title">Titolo</label>
              <input
                id="studio-note-title"
                type="text"
                maxLength={160}
                placeholder="Dai un titolo ai tuoi appunti"
                value={editingNote.title}
                onChange={(event) => setEditingNote((current) => current ? { ...current, title: event.target.value } : current)}
              />
              <div className="studio-note-content-heading">
                <label htmlFor="studio-note-content">Contenuto</label>
                <span>{editingNote.content.length.toLocaleString("it-IT")} / 50.000</span>
              </div>
              <textarea
                id="studio-note-content"
                rows={14}
                maxLength={50_000}
                placeholder="Scrivi qui appunti, formule, idee o passaggi da ricordare…"
                value={editingNote.content}
                onChange={(event) => setEditingNote((current) => current ? { ...current, content: event.target.value } : current)}
              />
              <p>Le note vengono salvate in questo notebook e non sono inviate a servizi AI.</p>
            </div>
            <div className="studio-note-modal-actions">
              {editingNote.id && (
                <button type="button" className="button button-danger" disabled={noteDeleting || noteSaving} onClick={() => void deleteNote()}>
                  {noteDeleting ? <LoaderCircle size={15} /> : <Trash2 size={15} />}
                  Elimina
                </button>
              )}
              <div>
                <button type="button" className="button button-secondary" disabled={noteSaving || noteDeleting} onClick={closeNoteEditor}>Chiudi</button>
                <button type="button" className="button button-primary" disabled={noteSaving || noteDeleting || !editingNote.title.trim()} onClick={() => void saveNote()}>
                  {noteSaving ? <LoaderCircle size={15} /> : <Check size={15} />}
                  {noteSaving ? "Salvataggio…" : "Salva nota"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

            <input id="studio-hidden-search" className="studio-hidden-search" aria-hidden="true" tabIndex={-1} />
    </div>
  );
}
