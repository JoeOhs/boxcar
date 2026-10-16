import JSZip from "jszip";
import type { Chapter, Manuscript } from "@/db/schema";
import { chapterLabel, numberChapters, sortChapters } from "./chapters";
import { countWords } from "./text";

/**
 * The draft for traditional human editing: a Word (.docx) file in the layout editors
 * expect for a manuscript. Double-spaced Times New Roman, 1-inch margins, a title page,
 * every chapter starting on a new page, scene breaks marked, and page numbers in the footer.
 * It opens in Word, Google Docs, LibreOffice and Pages, and the app's own Import reads it back.
 */

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  lineBreak?: boolean;
}

interface Para {
  style?: "Title" | "Subtitle" | "Heading1" | "Heading2" | "Heading3" | "Quote" | "Center";
  pageBreakBefore?: boolean;
  runs: Run[];
}

/** XML cannot hold control characters, and text must be escaped. */
function xml(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function collectRuns(node: Node, flags: { bold?: boolean; italic?: boolean; underline?: boolean }, out: Run[]): void {
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = (child.textContent ?? "").replace(/\s+/g, " ");
      if (text) out.push({ text, ...flags });
      return;
    }
    if (!(child instanceof Element)) return;
    const tag = child.tagName.toLowerCase();
    if (tag === "script" || tag === "style") return;
    if (tag === "br") {
      out.push({ text: "", lineBreak: true });
      return;
    }
    collectRuns(
      child,
      {
        bold: flags.bold || tag === "strong" || tag === "b",
        italic: flags.italic || tag === "em" || tag === "i",
        underline: flags.underline || tag === "u",
      },
      out,
    );
  });
}

function runsOf(el: Element): Run[] {
  const runs: Run[] = [];
  collectRuns(el, {}, runs);
  // Trim the whitespace the editor leaves at the ends of a paragraph.
  if (runs.length) {
    runs[0].text = runs[0].text.replace(/^\s+/, "");
    runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, "");
  }
  return runs.filter((r) => r.lineBreak || r.text.length > 0);
}

const BLOCK_TAGS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "li", "hr", "ul", "ol", "section", "div", "article"]);

function hasBlockChild(el: Element): boolean {
  return Array.from(el.children).some((c) => BLOCK_TAGS.has(c.tagName.toLowerCase()));
}

/** The editor's HTML as Word paragraphs, in reading order. */
function paragraphsOf(html: string, sceneBreak: string): Para[] {
  const body = new DOMParser().parseFromString(html, "text/html").body;
  const out: Para[] = [];

  const visit = (parent: Element) => {
    for (const child of Array.from(parent.children)) {
      const tag = child.tagName.toLowerCase();
      if (tag === "hr") {
        out.push({ style: "Center", runs: sceneBreak ? [{ text: sceneBreak }] : [] });
      } else if (/^h[1-6]$/.test(tag)) {
        const runs = runsOf(child);
        if (runs.length) out.push({ style: tag === "h2" ? "Heading2" : "Heading3", runs });
      } else if (tag === "blockquote") {
        const runs = runsOf(child);
        if (runs.length) out.push({ style: "Quote", runs });
      } else if (tag === "li") {
        const runs = runsOf(child);
        if (runs.length) out.push({ runs: [{ text: "\u2022 " }, ...runs] });
      } else if (tag === "p") {
        const runs = runsOf(child);
        if (runs.length) out.push({ runs });
      } else if (["section", "div", "article", "ul", "ol"].includes(tag)) {
        if (hasBlockChild(child)) visit(child);
        else {
          const runs = runsOf(child);
          if (runs.length) out.push({ runs });
        }
      } else {
        const runs = runsOf(child);
        if (runs.length) out.push({ runs });
      }
    }
  };

  // The body itself may hold loose text without a paragraph around it.
  if (!hasBlockChild(body)) {
    const runs = runsOf(body);
    if (runs.length) out.push({ runs });
  } else {
    visit(body);
  }
  return out;
}

function runXml(run: Run): string {
  if (run.lineBreak) return "<w:r><w:br/></w:r>";
  const props = `${run.bold ? "<w:b/>" : ""}${run.italic ? "<w:i/>" : ""}${run.underline ? '<w:u w:val="single"/>' : ""}`;
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${xml(run.text)}</w:t></w:r>`;
}

function paragraphXml(para: Para): string {
  const props = `${para.style ? `<w:pStyle w:val="${para.style}"/>` : ""}${para.pageBreakBefore ? "<w:pageBreakBefore/>" : ""}`;
  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${para.runs.map(runXml).join("")}</w:p>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W_NS}">
<w:docDefaults>
<w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="480" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:firstLine="720"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="2880" w:after="240" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="480" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr><w:rPr><w:i/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="480" w:after="480" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="240" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:i/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="240" w:line="240" w:lineRule="auto"/><w:ind w:left="720" w:right="720" w:firstLine="0"/></w:pPr><w:rPr><w:i/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Center"><w:name w:val="Scene Break"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="240" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr></w:style>
</w:styles>`;

const FOOTER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="${W_NS}"><w:p><w:pPr><w:pStyle w:val="Normal"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`;

/** Builds the editing draft as a .docx file. */
export async function buildDraftDocx(manuscript: Manuscript, author: string, chaptersIn: Chapter[]): Promise<Blob> {
  const chapters = sortChapters(chaptersIn);
  const numbers = numberChapters(chapters);
  const sceneBreak = manuscript.format.sceneBreak;
  const words = chapters.reduce((sum, c) => sum + countWords(c.content), 0);
  const fullTitle = manuscript.subtitle.trim() ? `${manuscript.title}: ${manuscript.subtitle.trim()}` : manuscript.title;

  const paras: Para[] = [
    { style: "Title", runs: [{ text: manuscript.title }] },
  ];
  if (manuscript.subtitle.trim()) paras.push({ style: "Subtitle", runs: [{ text: manuscript.subtitle.trim() }] });
  paras.push({ style: "Center", runs: [{ text: author }] });
  paras.push({ style: "Center", runs: [{ text: `Editing draft, about ${words.toLocaleString()} words` }] });

  for (const chapter of chapters) {
    const label = chapterLabel(chapter, numbers.get(chapter.id), "numbered-with-title");
    paras.push({ style: "Heading1", pageBreakBefore: true, runs: [{ text: label }] });
    paras.push(...paragraphsOf(chapter.content, sceneBreak));
  }

  const body = paras.map(paragraphXml).join("");
  const sectPr = `<w:sectPr><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:body>${body}${sectPr}</w:body></w:document>`;

  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(fullTitle)}</dc:title><dc:creator>${xml(author)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;

  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", ROOT_RELS);
  zip.file("docProps/core.xml", core);
  zip.file("word/document.xml", documentXml);
  zip.file("word/styles.xml", STYLES);
  zip.file("word/footer1.xml", FOOTER);
  zip.file("word/_rels/document.xml.rels", DOCUMENT_RELS);

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
}
