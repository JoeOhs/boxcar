import JSZip from "jszip";
import type { Chapter, FormatSettings, Manuscript, TrimSize } from "@/db/schema";
import { chapterLabel, numberChapters, sortChapters } from "./chapters";
import { resolveFormat } from "./formatPresets";
import { escapeHtml } from "./text";

export const TRIM_SIZES: Record<TrimSize, { label: string; width: number; height: number }> = {
  "5x8": { label: "5 x 8 in", width: 5, height: 8 },
  "5.25x8": { label: "5.25 x 8 in", width: 5.25, height: 8 },
  "5.5x8.5": { label: "5.5 x 8.5 in", width: 5.5, height: 8.5 },
  "6x9": { label: "6 x 9 in", width: 6, height: 9 },
};

export const FONT_CHOICES: { label: string; value: string }[] = [
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: '"Times New Roman", Times, serif' },
  { label: "Palatino", value: '"Palatino Linotype", Palatino, serif' },
  { label: "Garamond", value: "Garamond, serif" },
  { label: "Sans serif", value: "Helvetica, Arial, sans-serif" },
];

/** The one stylesheet used by both the preview and the exported epub. */
export function buildCss(f: FormatSettings): string {
  const indent = f.paragraphStyle === "indent";
  return `
body { font-family: ${f.fontFamily}; font-size: ${f.fontSizePercent}%; line-height: ${f.lineHeight}; margin: 0; }
p { margin: ${indent ? "0" : "0 0 1em 0"}; text-indent: ${indent ? "1.5em" : "0"}; text-align: justify; orphans: 2; widows: 2; }
h1 { font-size: 1.6em; text-align: center; margin: 3em 0 1.5em 0; line-height: 1.2; font-weight: bold; page-break-before: always; }
h1 .chapnum { display: block; font-size: 0.6em; letter-spacing: 0.15em; text-transform: uppercase; font-weight: normal; margin-bottom: 0.4em; }
h2 { font-size: 1.25em; margin: 1.5em 0 0.5em 0; text-indent: 0; }
h3 { font-size: 1.1em; margin: 1.2em 0 0.4em 0; text-indent: 0; }
blockquote { margin: 1em 2em; font-style: italic; }
ul, ol { margin: 0 0 1em 1.5em; }
.chapter > h1 + p, h2 + p, h3 + p, .scenebreak + p { text-indent: 0; }
.scenebreak { text-align: center; text-indent: 0; margin: 1.2em 0; }
${f.dropCaps ? ".chapter > h1 + p::first-letter { float: left; font-size: 3.2em; line-height: 0.85; padding: 0.05em 0.08em 0 0; }" : ""}
.titlepage { text-align: center; margin-top: 25%; }
.titlepage h1 { page-break-before: avoid; margin: 0 0 0.3em 0; }
.titlepage .subtitle { text-indent: 0; text-align: center; font-style: italic; margin: 0 0 2em 0; }
.titlepage .author { text-indent: 0; text-align: center; font-size: 1.2em; letter-spacing: 0.1em; }
.copyright p { text-indent: 0; text-align: left; font-size: 0.85em; margin: 0 0 0.8em 0; }
.cover { text-align: center; }
.cover img { max-width: 100%; max-height: 100%; }
nav ol { list-style: none; margin: 0; padding: 0; }
nav li { margin: 0.5em 0; text-indent: 0; }
nav a { text-decoration: none; color: inherit; }
`.trim();
}

/**
 * Cleans the editor's HTML and returns it as XHTML (what an epub needs):
 * scene breaks become styled paragraphs, scripts and inline styles are removed.
 */
export function toXhtmlBody(html: string, sceneBreak: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,iframe,object,embed,link,meta").forEach((node) => node.remove());
  // Writing scenes are an authoring aid; in the book their text simply runs on.
  doc.querySelectorAll("section[data-segment]").forEach((scene) => {
    scene.replaceWith(...Array.from(scene.childNodes));
  });
  doc.querySelectorAll("hr").forEach((rule) => {
    const p = doc.createElement("p");
    p.className = "scenebreak";
    p.textContent = sceneBreak;
    rule.replaceWith(p);
  });
  doc.querySelectorAll("div").forEach((div) => {
    const p = doc.createElement("p");
    p.innerHTML = div.innerHTML;
    div.replaceWith(p);
  });
  doc.querySelectorAll("*").forEach((el) => {
    el.removeAttribute("style");
    el.removeAttribute("contenteditable");
    for (const name of el.getAttributeNames()) {
      if (name.startsWith("on")) el.removeAttribute(name);
    }
  });
  // Empty paragraphs from the editor would render as blank gaps.
  doc.querySelectorAll("p").forEach((p) => {
    if (!p.textContent?.trim() && !p.querySelector("img")) p.remove();
  });
  const serialized = new XMLSerializer().serializeToString(doc.body);
  if (/^<body[^>]*\/>$/.test(serialized)) return "";
  return serialized.replace(/^<body[^>]*>/, "").replace(/<\/body>$/, "");
}

function chapterHeadingHtml(chapter: Chapter, number: number | undefined, f: FormatSettings): string {
  const title = escapeHtml(chapter.title.trim());
  if (chapter.kind !== "chapter" || number === undefined || f.headingStyle === "plain") {
    return `<h1>${title || "Untitled"}</h1>`;
  }
  if (f.headingStyle === "numbered") return `<h1><span class="chapnum">Chapter ${number}</span></h1>`;
  return `<h1><span class="chapnum">Chapter ${number}</span>${title}</h1>`;
}

/** One chapter as a <section> of XHTML: heading first, then the text. */
function chapterSection(chapter: Chapter, number: number | undefined, f: FormatSettings): string {
  const epubType = chapter.kind === "chapter" ? "chapter" : chapter.kind === "front" ? "frontmatter" : "backmatter";
  return `<section class="chapter" epub:type="${epubType}">${chapterHeadingHtml(chapter, number, f)}${toXhtmlBody(chapter.content, f.sceneBreak)}</section>`;
}

function xhtmlDocument(title: string, language: string, body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeHtml(language)}" xml:lang="${escapeHtml(language)}">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
${body}
</body>
</html>`;
}

function titlePageBody(manuscript: Manuscript, author: string): string {
  const subtitle = manuscript.subtitle.trim()
    ? `<p class="subtitle">${escapeHtml(manuscript.subtitle.trim())}</p>`
    : "";
  return `<section class="titlepage" epub:type="titlepage"><h1>${escapeHtml(manuscript.title)}</h1>${subtitle}<p class="author">${escapeHtml(author)}</p></section>`;
}

function copyrightBody(manuscript: Manuscript): string {
  const lines: string[] = [];
  if (manuscript.copyright.trim()) {
    for (const line of manuscript.copyright.trim().split(/\n+/)) lines.push(`<p>${escapeHtml(line)}</p>`);
  }
  if (manuscript.isbn.trim()) lines.push(`<p>ISBN: ${escapeHtml(manuscript.isbn.trim())}</p>`);
  return `<section class="copyright" epub:type="copyright-page">${lines.join("")}</section>`;
}

const IMAGE_EXTENSION: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg" };

/**
 * A book with any detail missing (a field added after it was made, or a restored
 * backup from an older version) is read with empty values, so it still builds and previews.
 */
function completeManuscript(m: Manuscript): Manuscript {
  return {
    ...m,
    title: m.title || "Untitled manuscript",
    subtitle: m.subtitle ?? "",
    description: m.description ?? "",
    isbn: m.isbn ?? "",
    copyright: m.copyright ?? "",
    language: m.language || "en",
    keywords: m.keywords ?? [],
  };
}

/** Builds a complete EPUB 3 file (with an NCX for older readers) ready for Amazon KDP. */
export async function buildEpub(manuscriptIn: Manuscript, author: string, chaptersIn: Chapter[]): Promise<Blob> {
  const manuscript = completeManuscript(manuscriptIn);
  const f = resolveFormat(manuscript.format);
  const chapters = sortChapters(chaptersIn);
  const numbers = numberChapters(chapters);
  const language = manuscript.language.trim() || "en";
  const fullTitle = manuscript.subtitle.trim() ? `${manuscript.title}: ${manuscript.subtitle.trim()}` : manuscript.title;
  const identifier = manuscript.isbn.trim() ? `urn:isbn:${manuscript.isbn.trim()}` : `urn:uuid:${manuscript.id}`;
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
  );
  zip.file("OEBPS/style.css", buildCss(f));

  const manifest: string[] = [
    `<item id="css" href="style.css" media-type="text/css"/>`,
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
  ];
  const spine: string[] = [];

  // Cover
  let hasCover = false;
  if (manuscript.cover) {
    const extension = IMAGE_EXTENSION[manuscript.cover.type] ?? "jpg";
    const mediaType = extension === "png" ? "image/png" : "image/jpeg";
    zip.file(`OEBPS/images/cover.${extension}`, await manuscript.cover.arrayBuffer());
    zip.file(
      "OEBPS/cover.xhtml",
      xhtmlDocument(
        "Cover",
        language,
        `<section class="cover" epub:type="cover"><img src="images/cover.${extension}" alt="Cover"/></section>`,
      ),
    );
    manifest.push(`<item id="cover-image" href="images/cover.${extension}" media-type="${mediaType}" properties="cover-image"/>`);
    manifest.push(`<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="cover" linear="no"/>`);
    hasCover = true;
  }

  // Title page and copyright page
  zip.file("OEBPS/titlepage.xhtml", xhtmlDocument(manuscript.title, language, titlePageBody(manuscript, author)));
  manifest.push(`<item id="titlepage" href="titlepage.xhtml" media-type="application/xhtml+xml"/>`);
  spine.push(`<itemref idref="titlepage"/>`);

  if (manuscript.copyright.trim() || manuscript.isbn.trim()) {
    zip.file("OEBPS/copyright.xhtml", xhtmlDocument("Copyright", language, copyrightBody(manuscript)));
    manifest.push(`<item id="copyright" href="copyright.xhtml" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="copyright"/>`);
  }

  // Table of contents page (always present for readers; only part of the reading order if chosen)
  spine.push(`<itemref idref="nav"${f.includeTableOfContents ? "" : ' linear="no"'}/>`);

  // Chapters
  const entries: { href: string; label: string }[] = [];
  chapters.forEach((chapter, index) => {
    const id = `chapter-${index + 1}`;
    const href = `${id}.xhtml`;
    const label = chapterLabel(chapter, numbers.get(chapter.id), f.headingStyle);
    zip.file(`OEBPS/${href}`, xhtmlDocument(label, language, chapterSection(chapter, numbers.get(chapter.id), f)));
    manifest.push(`<item id="${id}" href="${href}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="${id}"/>`);
    entries.push({ href, label });
  });

  const firstBody = chapters.findIndex((c) => c.kind === "chapter");
  const landmarks = [
    `<li><a epub:type="toc" href="nav.xhtml">Table of Contents</a></li>`,
    ...(firstBody >= 0 ? [`<li><a epub:type="bodymatter" href="${entries[firstBody].href}">Start of book</a></li>`] : []),
  ].join("");
  zip.file(
    "OEBPS/nav.xhtml",
    xhtmlDocument(
      "Contents",
      language,
      `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${entries
        .map((e) => `<li><a href="${e.href}">${escapeHtml(e.label)}</a></li>`)
        .join("")}</ol></nav>
<nav epub:type="landmarks" hidden="hidden"><ol>${landmarks}</ol></nav>`,
    ),
  );

  zip.file(
    "OEBPS/toc.ncx",
    `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head>
<meta name="dtb:uid" content="${escapeHtml(identifier)}"/>
<meta name="dtb:depth" content="1"/>
<meta name="dtb:totalPageCount" content="0"/>
<meta name="dtb:maxPageNumber" content="0"/>
</head>
<docTitle><text>${escapeHtml(fullTitle)}</text></docTitle>
<navMap>
${entries
  .map(
    (e, i) =>
      `<navPoint id="navpoint-${i + 1}" playOrder="${i + 1}"><navLabel><text>${escapeHtml(e.label)}</text></navLabel><content src="${e.href}"/></navPoint>`,
  )
  .join("\n")}
</navMap>
</ncx>`,
  );

  const subjects = manuscript.keywords.map((k) => k.trim()).filter(Boolean);
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${escapeHtml(language)}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">${escapeHtml(identifier)}</dc:identifier>
<dc:title>${escapeHtml(fullTitle)}</dc:title>
<dc:creator>${escapeHtml(author)}</dc:creator>
<dc:language>${escapeHtml(language)}</dc:language>
${manuscript.description.trim() ? `<dc:description>${escapeHtml(manuscript.description.trim())}</dc:description>` : ""}
${subjects.map((s) => `<dc:subject>${escapeHtml(s)}</dc:subject>`).join("\n")}
${manuscript.copyright.trim() ? `<dc:rights>${escapeHtml(manuscript.copyright.trim())}</dc:rights>` : ""}
<meta property="dcterms:modified">${modified}</meta>
${hasCover ? `<meta name="cover" content="cover-image"/>` : ""}
</metadata>
<manifest>
${manifest.join("\n")}
</manifest>
<spine toc="ncx">
${spine.join("\n")}
</spine>
</package>`,
  );

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/epub+zip",
    compression: "DEFLATE",
  });
}

/** A full HTML page that shows the book the way the format settings will export it. */
export function buildPreviewDocument(
  manuscriptIn: Manuscript,
  author: string,
  chaptersIn: Chapter[],
  formatIn: Partial<FormatSettings> | undefined,
): string {
  const manuscript = completeManuscript(manuscriptIn);
  const f = resolveFormat(formatIn);
  const chapters = sortChapters(chaptersIn);
  const numbers = numberChapters(chapters);
  const trim = TRIM_SIZES[f.trimSize];
  const toc = f.includeTableOfContents
    ? `<nav><h1>Contents</h1><ol>${chapters
        .map((c) => `<li>${escapeHtml(chapterLabel(c, numbers.get(c.id), f.headingStyle))}</li>`)
        .join("")}</ol></nav>`
    : "";
  const body = chapters.map((c) => chapterSection(c, numbers.get(c.id), f)).join("");
  const empty = chapters.length === 0 ? `<p style="text-indent:0;text-align:center">No chapters yet. Write something to see it here.</p>` : "";

  // The preview page only differs from the epub by the paper around it.
  return `<!doctype html>
<html lang="${escapeHtml(manuscript.language || "en")}">
<head>
<meta charset="utf-8"/>
<style>${buildCss(f)}</style>
<style>
html { background: #e7e2d8; }
body { padding: 1.5rem 1rem; }
.page { background: #fff; color: #1d1b18; width: ${Math.round(trim.width * 96)}px; max-width: 100%; box-sizing: border-box; min-height: ${Math.round(trim.height * 96)}px; margin: 0 auto 1.5rem auto; padding: 2.2rem 2.4rem; box-shadow: 0 1px 6px rgba(0,0,0,.18); }
.page h1 { page-break-before: avoid; }
</style>
</head>
<body>
<div class="page">${titlePageBody(manuscript, author)}</div>
${toc ? `<div class="page">${toc}</div>` : ""}
<div class="page">${body}${empty}</div>
</body>
</html>`;
}
