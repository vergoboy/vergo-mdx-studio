import { parseMeta, split } from './frontmatter';
import type { CompileResult } from './compile';

export interface Check { level: 'error' | 'warn' | 'info'; text: string; line?: number; column?: number; detail?: string }

/** The same kind of rules the dashboard's "SEO health" applies, shown before you send anything. */
export function checkPage(source: string, compiled: CompileResult | null, missingMedia: string[] = []): Check[] {
	const m = parseMeta(source); const { body } = split(source);
	const out: Check[] = [];
	if (!m.title) out.push({ level: 'error', text: 'Missing `title` in frontmatter.' });
	else if (m.title.length < 25 || m.title.length > 65) out.push({ level: 'warn', text: `Title is ${m.title.length} characters (aim for 30–60 for search results).` });
	if (!m.summary) out.push({ level: 'warn', text: 'Missing `summary` — it becomes the "Quick answer" and the meta description.' });
	else if (m.summary.length < 70 || m.summary.length > 165) out.push({ level: 'info', text: `Summary is ${m.summary.length} characters (70–160 reads best in search).` });
	if (m.lang && m.lang !== 'en' && m.lang !== 'fa') out.push({ level: 'error', text: '`lang` must be en or fa.' });
	if (!m.tags.length) out.push({ level: 'info', text: 'No tags.' });
	if (!m.faq.length) out.push({ level: 'info', text: 'No FAQ — adding Q&A improves answer-engine (AEO) visibility.' });
	if (/^# \S/m.test(body.replace(/```[\s\S]*?```/g, ''))) out.push({ level: 'warn', text: 'Body contains an H1; the page title is already the H1 (use ##).' });
	if (/!\[\s*\]\(/.test(body)) out.push({ level: 'warn', text: 'An image has empty alt text.' });
	if (body.split(/\s+/).filter(Boolean).length < 120) out.push({ level: 'info', text: 'Short page (<120 words).' });
	for (const f of missingMedia) out.push({ level: 'error', text: `Media file not found in the vault: ${f}` });
	if (compiled) {
		for (const e of compiled.errors) {
			const caret = e.excerpt ? `${e.excerpt}\n${' '.repeat(Math.max(0, e.column - 1))}^` : '';
			out.push({ level: 'error', text: `Line ${e.line}: ${e.message}`, line: e.line, column: e.column, detail: [caret, e.hint].filter(Boolean).join('\n\n') });
		}
		for (const w of compiled.warnings) out.push({ level: 'info', text: w });
		for (const c of compiled.unknownComponents) out.push({ level: 'info', text: `<${c}> only renders on the website.` });
	}
	return out;
}
