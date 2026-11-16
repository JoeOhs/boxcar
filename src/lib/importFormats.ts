/**
 * The file types the app can import. Kept apart from documents.ts so a screen can show a
 * file picker without loading the readers (and the zip library) until a file is chosen.
 */
export const IMPORT_EXTENSIONS = [".txt", ".md", ".markdown", ".html", ".htm", ".docx", ".epub"];
export const IMPORT_ACCEPT = IMPORT_EXTENSIONS.join(",");
