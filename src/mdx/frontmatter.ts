/** Small, tolerant frontmatter helpers (no YAML dependency; we only need a handful of keys). */

export interface Faq { q: string; a: string }
export interface Meta {
	title?: string; lang?: string; slug?: string; date?: string; updated?: string; summary?: string;
	image?: string; imageAlt?: string; tags: string[]; faq: Faq[]; publish?: boolean; raw: string;
}

const FM = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function split(src: string): { raw: string; body: string; lines: number; has: boolean } {
	const m = FM.exec(src);
	if (!m) return { raw: '', body: src, lines: 0, has: false };
	return { raw: m[1], body: src.slice(m[0].length), lines: m[0].split('\n').length - 1, has: true };
}

const unq = (v: string) => {
	const s = v.trim();
	if (s.startsWith('"') && s.endsWith('"')) { try { return JSON.parse(s) as string; } catch { return s.slice(1, -1); } }
	if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
	return s;
};

function list(raw: string, key: string): string[] {
	const lines = raw.split(/\r?\n/);
	const i = lines.findIndex((l) => new RegExp(`^${key}\\s*:`).test(l));
	if (i < 0) return [];
	const rest = lines[i].replace(new RegExp(`^${key}\\s*:\\s*`), '').trim();
	if (rest.startsWith('[')) return rest.replace(/^\[|\]$/g, '').split(',').map(unq).filter(Boolean);
	const out: string[] = [];
	for (let j = i + 1; j < lines.length && /^\s*-\s/.test(lines[j]); j++) out.push(unq(lines[j].replace(/^\s*-\s+/, '')));
	return out.filter(Boolean);
}

function faq(raw: string): Faq[] {
	const lines = raw.split(/\r?\n/);
	const i = lines.findIndex((l) => /^faq\s*:\s*$/.test(l));
	if (i < 0) return [];
	const out: Faq[] = []; let cur: Partial<Faq> | null = null;
	for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j]) || (j < lines.length && /^\s*-\s/.test(lines[j])); j++) {
		const m = /^\s*(?:-\s+)?(q|a)\s*:\s*(.*)$/.exec(lines[j]);
		if (!m) continue;
		if (m[1] === 'q') { if (cur?.q && cur.a) out.push(cur as Faq); cur = { q: unq(m[2]) }; } else if (cur) cur.a = unq(m[2]);
	}
	if (cur?.q && cur.a) out.push(cur as Faq);
	return out;
}

export function parseMeta(src: string): Meta {
	const { raw } = split(src);
	const get = (k: string) => { const m = new RegExp(`^${k}\\s*:\\s*(.*?)\\s*$`, 'm').exec(raw); return m && m[1] !== '' ? unq(m[1]) : undefined; };
	return {
		title: get('title'), lang: get('lang'), slug: get('slug'), date: get('date'), updated: get('updated'), summary: get('summary'),
		image: get('image'), imageAlt: get('imageAlt'), tags: list(raw, 'tags'), faq: faq(raw),
		publish: get('publish') === 'false' ? false : undefined, raw,
	};
}

/** Set top-level scalar keys, leaving every other line exactly as written. */
export function setKeys(src: string, updates: Record<string, string | undefined>): string {
	const { raw, body, has } = split(src);
	const lines = has ? raw.split(/\r?\n/) : [];
	for (const [key, value] of Object.entries(updates)) {
		const idx = lines.findIndex((l) => new RegExp(`^${key}\\s*:`).test(l));
		if (value === undefined) { if (idx >= 0) lines.splice(idx, 1); continue; }
		const line = `${key}: ${JSON.stringify(value)}`;
		if (idx >= 0) lines[idx] = line; else lines.push(line);
	}
	return `---\n${lines.join('\n')}\n---\n${has ? body : `\n${body}`}`;
}

export function slugify(text: string): string {
	return text.normalize('NFC').toLowerCase().trim().replace(/[\s_]+/g, '-').replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
}

export function newNoteTemplate(o: { title: string; lang: string; date: string }): string {
	return `---\ntitle: ${JSON.stringify(o.title)}\ndate: ${o.date}\nlang: ${o.lang}\ntags: []\nsummary: ""\n---\n\n## \n`;
}
