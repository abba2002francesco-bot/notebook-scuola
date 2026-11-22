export type Notebook = {
  id: string;
  user_id: string;
  title: string;
  notebook_url: string;
  subject: string;
  education_level: string;
  topic: string | null;
  school: string | null;
  tags: string[];
  content_types: string[];
  description: string;
  image_paths: string[];
  source_count?: number | null;
  created_at: string;
  profiles?: { display_name: string | null; username?: string | null } | null;
  useful_count?: number;
  comment_count?: number;
};

export type NotebookComment = {
  id: string;
  notebook_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles?: { display_name: string | null; username?: string | null } | null;
};

export const SUBJECTS = [
  "Matematica",
  "Fisica",
  "Italiano",
  "Storia",
  "Inglese",
  "Filosofia",
  "Chimica",
  "Biologia",
  "Informatica",
  "Economia",
  "Diritto",
  "Arte",
  "Geografia",
  "Scienze",
  "Altro",
];

export const LEVELS = ["Medie", "Superiori", "Università", "Altro"];
export const CONTENT_TYPES = ["Audio", "Video", "Quiz", "Flashcard", "Mappa mentale", "Guida", "Sintesi"];
