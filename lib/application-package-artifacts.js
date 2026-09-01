import { createHash } from 'node:crypto';
import {
  AlignmentType, BorderStyle, Document, LevelFormat, Packer, PageBreak, Paragraph, TextRun,
} from 'docx';
import PDFDocument from 'pdfkit';
import mammoth from 'mammoth';
import { DOMMatrix, Path2D } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PDF_MARGIN = 50;
const MAX_ARTIFACT_BYTES = 350_000;
const SECTION = /^(?:professional summary|summary|profile|core competencies|skills|experience|professional experience|work experience|education|certifications|selected achievements|additional information)$/i;
const CONTACT = /(?:@|https?:\/\/|linkedin\.com|(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4})/i;

function clean(value, max = 40_000) {
  return String(value || '').replace(/\r/g, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

function asciiFilePart(value, fallback) {
  return clean(value, 120).normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || fallback;
}

function blocksFromText(value, kind) {
  const lines = clean(value).split('\n').map(line => line.trimEnd());
  const blocks = [];
  let firstContent = true;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (blocks.at(-1)?.type !== 'space') blocks.push({ type: 'space', text: '' });
      continue;
    }
    if (kind === 'resume' && firstContent) {
      blocks.push({ type: 'name', text: line });
      firstContent = false;
      continue;
    }
    firstContent = false;
    if (kind === 'resume' && blocks.filter(block => block.type !== 'space').length <= 3 && CONTACT.test(line)) {
      blocks.push({ type: 'contact', text: line });
    } else if (SECTION.test(line.replace(/:$/, '')) || (line === line.toUpperCase() && /[A-Z]/.test(line) && line.length <= 64)) {
      blocks.push({ type: 'heading', text: line.replace(/:$/, '').toUpperCase() });
    } else if (/^(?:[-*\u2022]\s+|\d+[.)]\s+)/.test(line)) {
      blocks.push({ type: 'bullet', text: line.replace(/^(?:[-*\u2022]\s+|\d+[.)]\s+)/, '') });
    } else {
      blocks.push({ type: 'body', text: line });
    }
  }
  while (blocks[0]?.type === 'space') blocks.shift();
  while (blocks.at(-1)?.type === 'space') blocks.pop();
  return blocks;
}

function wrapText(text, width, fontSize, factor = 0.51) {
  const words = clean(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const proposed = current ? `${current} ${word}` : word;
    if (proposed.length * fontSize * factor <= width || !current) current = proposed;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function blockHeight(block, width = PAGE_WIDTH - (PDF_MARGIN * 2)) {
  if (block.type === 'space') return 5;
  if (block.type === 'name') return 24;
  if (block.type === 'contact') return 15;
  if (block.type === 'heading') return 22;
  const fontSize = block.type === 'bullet' ? 9.6 : 10;
  return wrapText(block.text, width - (block.type === 'bullet' ? 14 : 0), fontSize).length * 12.2 + 3;
}

function resumePages(blocks) {
  const usable = PAGE_HEIGHT - (PDF_MARGIN * 2);
  const total = blocks.reduce((sum, block) => sum + blockHeight(block), 0);
  if (total < usable * 0.86) return { pages: [blocks], pageHeights: [total], estimatedHeight: total, issue: '' };
  if (total > usable * 1.92) return { pages: [blocks], estimatedHeight: total, issue: 'RESUME_EXCEEDS_TWO_PAGE_LAYOUT' };
  const target = total / 2;
  let consumed = 0;
  let split = 1;
  for (let index = 0; index < blocks.length - 1; index += 1) {
    consumed += blockHeight(blocks[index]);
    if (consumed >= target) { split = index + 1; break; }
  }
  while (split > 1 && blocks[split]?.type === 'body' && blocks[split - 1]?.type === 'heading') split -= 1;
  while (blocks[split]?.type === 'space') split += 1;
  const pages = [blocks.slice(0, split), blocks.slice(split)];
  const pageHeights = pages.map(page => page.reduce((sum, block) => sum + blockHeight(block), 0));
  const issue = pageHeights.some(height => height > usable * 0.98) ? 'RESUME_PAGE_OVERFLOW_RISK' : '';
  return { pages, pageHeights, estimatedHeight: total, issue };
}

function paragraphForBlock(block, pageBreakBefore = false) {
  const common = { pageBreakBefore, widowControl: true };
  if (block.type === 'space') return new Paragraph({ ...common, spacing: { after: 30 }, children: [] });
  if (block.type === 'name') return new Paragraph({
    ...common, alignment: AlignmentType.CENTER, spacing: { after: 60 },
    children: [new TextRun({ text: block.text, bold: true, font: 'Arial', size: 36, color: '111111' })],
  });
  if (block.type === 'contact') return new Paragraph({
    ...common, alignment: AlignmentType.CENTER, spacing: { after: 50 },
    children: [new TextRun({ text: block.text, font: 'Arial', size: 19, color: '333333' })],
  });
  if (block.type === 'heading') return new Paragraph({
    ...common, keepNext: true, spacing: { before: 120, after: 45 },
    children: [new TextRun({ text: block.text, bold: true, font: 'Arial', size: 22, color: '111111' })],
  });
  if (block.type === 'bullet') return new Paragraph({
    ...common, numbering: { reference: 'ats-bullets', level: 0 }, spacing: { after: 40, line: 240 },
    children: [new TextRun({ text: block.text, font: 'Arial', size: 19, color: '111111' })],
  });
  return new Paragraph({
    ...common, spacing: { after: 50, line: 240 },
    children: [new TextRun({ text: block.text, font: 'Arial', size: 20, color: '111111' })],
  });
}

async function buildDocx({ text, kind, pages }) {
  const children = [];
  pages.forEach((page, pageIndex) => {
    if (pageIndex > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    page.forEach(block => children.push(paragraphForBlock(block)));
  });
  const document = new Document({
    creator: '1stStep.ai Job Agent', lastModifiedBy: '1stStep.ai Job Agent',
    title: kind === 'resume' ? 'Role-specific resume' : 'Role-specific cover letter',
    description: 'Private ATS-safe application document generated from candidate-reviewed facts.',
    styles: {
      default: { document: { run: { font: 'Arial', size: 20, color: '111111' }, paragraph: { spacing: { after: 50, line: 240 } } } },
    },
    numbering: { config: [{ reference: 'ats-bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 180 } } } }] }] },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 720, right: 792, bottom: 720, left: 792, header: 360, footer: 360 } } },
      children,
    }],
  });
  const buffer = await Packer.toBuffer(document);
  if (!buffer.length || buffer.length > MAX_ARTIFACT_BYTES) throw new Error('DOCX_ARTIFACT_SIZE');
  const extracted = clean((await mammoth.extractRawText({ buffer })).value);
  return { buffer, extracted, sourceText: clean(text) };
}

function renderPdfBlock(doc, block) {
  const width = PAGE_WIDTH - (PDF_MARGIN * 2);
  if (block.type === 'space') { doc.moveDown(0.25); return; }
  if (block.type === 'name') {
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#111111').text(block.text, { width, align: 'center', lineGap: 1 });
    doc.moveDown(0.18); return;
  }
  if (block.type === 'contact') {
    doc.font('Helvetica').fontSize(9.5).fillColor('#333333').text(block.text, { width, align: 'center', lineGap: 1 });
    doc.moveDown(0.2); return;
  }
  if (block.type === 'heading') {
    doc.moveDown(0.45);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111111').text(block.text, { width, lineGap: 1 });
    doc.moveDown(0.15); return;
  }
  if (block.type === 'bullet') {
    doc.font('Helvetica').fontSize(9.6).fillColor('#111111').text(`- ${block.text}`, { width, indent: 10, paragraphGap: 3, lineGap: 1 });
    return;
  }
  doc.font('Helvetica').fontSize(10).fillColor('#111111').text(block.text, { width, paragraphGap: 3, lineGap: 1 });
}

async function buildPdf({ pages }) {
  const document = new PDFDocument({ autoFirstPage: false, size: 'LETTER', margins: { top: PDF_MARGIN, right: PDF_MARGIN, bottom: PDF_MARGIN, left: PDF_MARGIN }, compress: false, info: { Author: '1stStep.ai Job Agent', Creator: '1stStep.ai Job Agent', Producer: '1stStep.ai Job Agent' } });
  const chunks = [];
  document.on('data', chunk => chunks.push(chunk));
  const finished = new Promise((resolve, reject) => { document.on('end', () => resolve(Buffer.concat(chunks))); document.on('error', reject); });
  pages.forEach(page => {
    document.addPage();
    page.forEach(block => renderPdfBlock(document, block));
  });
  document.end();
  const buffer = await finished;
  if (!buffer.length || buffer.length > MAX_ARTIFACT_BYTES) throw new Error('PDF_ARTIFACT_SIZE');
  return buffer;
}

function tokens(value) {
  return clean(value).toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+/gu) || [];
}

function orderedCoverage(sourceText, extractedText) {
  const source = tokens(sourceText);
  const extracted = tokens(extractedText);
  let cursor = 0;
  for (const token of source) {
    while (cursor < extracted.length && extracted[cursor] !== token) cursor += 1;
    if (cursor >= extracted.length) return false;
    cursor += 1;
  }
  return source.length > 0;
}

async function extractPdf(buffer) {
  if (!globalThis.DOMMatrix) globalThis.DOMMatrix = DOMMatrix;
  if (!globalThis.Path2D) globalThis.Path2D = Path2D;
  const task = getDocument({ data: new Uint8Array(buffer), disableWorker: true, useSystemFonts: true });
  const pdf = await task.promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => item.str).join(' '));
  }
  if (typeof pdf.destroy === 'function') await pdf.destroy();
  else if (typeof task.destroy === 'function') await task.destroy();
  return { pageCount: pages.length, text: clean(pages.join('\n')) };
}

function artifactRecord(key, filename, contentType, buffer, pageCount) {
  return {
    key, filename, contentType, bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex'),
    pageCount, contentBase64: buffer.toString('base64'),
  };
}

export async function buildApplicationPackageArtifacts({ employer, title, documentVersion, resumeText, coverLetterText }) {
  const resumeBlocks = blocksFromText(resumeText, 'resume');
  const resumeLayout = resumePages(resumeBlocks);
  const layoutIssues = resumeLayout.issue ? [resumeLayout.issue] : [];
  const coverBlocks = coverLetterText ? blocksFromText(coverLetterText, 'cover') : [];
  const base = `${asciiFilePart(employer, 'employer')}-${asciiFilePart(title, 'role')}-${asciiFilePart(documentVersion, 'version')}`.toLowerCase();
  const resumeDocx = await buildDocx({ text: resumeText, kind: 'resume', pages: resumeLayout.pages });
  const resumePdf = await buildPdf({ pages: resumeLayout.pages });
  const resumePdfExtract = await extractPdf(resumePdf);
  const artifacts = [
    artifactRecord('resume_docx', `${base}-resume.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', resumeDocx.buffer, resumeLayout.pages.length),
    artifactRecord('resume_pdf', `${base}-resume.pdf`, 'application/pdf', resumePdf, resumePdfExtract.pageCount),
  ];
  let coverQa = { present: false, docxTextOrderChecked: true, pdfTextExtracted: true, pageCount: 0 };
  if (coverBlocks.length) {
    const coverPages = [coverBlocks];
    const coverEstimatedHeight = coverBlocks.reduce((sum, block) => sum + blockHeight(block), 0);
    if (coverEstimatedHeight > (PAGE_HEIGHT - (PDF_MARGIN * 2)) * 0.98) layoutIssues.push('COVER_LETTER_PAGE_OVERFLOW_RISK');
    const coverDocx = await buildDocx({ text: coverLetterText, kind: 'cover', pages: coverPages });
    const coverPdf = await buildPdf({ pages: coverPages });
    const coverPdfExtract = await extractPdf(coverPdf);
    const coverDocxOrder = orderedCoverage(coverLetterText, coverDocx.extracted);
    const coverPdfOrder = orderedCoverage(coverLetterText, coverPdfExtract.text);
    if (!coverDocxOrder) layoutIssues.push('COVER_DOCX_TEXT_ORDER_MISMATCH');
    if (!coverPdfOrder) layoutIssues.push('COVER_PDF_TEXT_EXTRACTION_MISMATCH');
    if (coverPdfExtract.pageCount !== 1) layoutIssues.push('COVER_LETTER_PAGE_COUNT');
    artifacts.push(
      artifactRecord('cover_docx', `${base}-cover-letter.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', coverDocx.buffer, 1),
      artifactRecord('cover_pdf', `${base}-cover-letter.pdf`, 'application/pdf', coverPdf, coverPdfExtract.pageCount),
    );
    coverQa = { present: true, docxTextOrderChecked: coverDocxOrder, pdfTextExtracted: coverPdfOrder, pageCount: coverPdfExtract.pageCount };
  }
  const resumeDocxOrder = orderedCoverage(resumeText, resumeDocx.extracted);
  const resumePdfOrder = orderedCoverage(resumeText, resumePdfExtract.text);
  if (!resumeDocxOrder) layoutIssues.push('RESUME_DOCX_TEXT_ORDER_MISMATCH');
  if (!resumePdfOrder) layoutIssues.push('RESUME_PDF_TEXT_EXTRACTION_MISMATCH');
  if (![1, 2].includes(resumePdfExtract.pageCount)) layoutIssues.push('RESUME_PAGE_COUNT');
  return {
    artifacts,
    qa: {
      issues: [...new Set(layoutIssues)], formats: ['DOCX', 'PDF'], docxTextOrderChecked: resumeDocxOrder && coverQa.docxTextOrderChecked,
      pdfTextExtracted: resumePdfOrder && coverQa.pdfTextExtracted, pageCount: resumePdfExtract.pageCount,
      coverLetter: coverQa, visualPageInspection: false, visualRenderStatus: 'pending-isolated-render-worker',
      layoutEstimator: { version: 'ats-resume-v1', pageHeights: resumeLayout.pageHeights || [], estimatedHeight: resumeLayout.estimatedHeight },
      preset: 'standard-business-brief-ats-resume-override-v1',
    },
  };
}
