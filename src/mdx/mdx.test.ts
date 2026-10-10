import { describe, it, expect } from 'vitest';
import { compileMdx } from './compile';
import { convertObsidian } from './obsidianSyntax';
import { parseMeta, setKeys, newNoteTemplate, slugify } from './frontmatter';
import { checkPage } from './checks';

const fm = (body: string) => `---\ntitle: "T"\n---\n${body}`;

describe('compileMdx', () => {
	it('renders markdown, GFM tables, expressions and JSX', async () => {
		const r = await compileMdx(fm('## Hello\n\nValue: {1 + 2}\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n<div className="x">raw</div>\n\n==not mdx== text'));
		expect(r.ok).toBe(true);
		expect(r.html).toContain('<h2 id="hello">Hello</h2>');
		expect(r.html).toContain('Value: 3');
		expect(r.html).toContain('<table>');
		expect(r.html).toContain('<div class="x">raw</div>');
		expect(r.headings).toEqual([{ depth: 2, text: 'Hello', id: 'hello' }]);
	});
	it('reports errors with the line in the whole file (frontmatter included)', async () => {
		const r = await compileMdx(fm('line one\n\n<Unclosed>\n'));
		expect(r.ok).toBe(false);
		expect(r.errors[0].line).toBeGreaterThanOrEqual(4);
		expect(r.errors[0].message.length).toBeGreaterThan(3);
	});
	it('renders the built-in site components and ignores their imports', async () => {
		const r = await compileMdx(fm("import { Callout } from \"@/components/Callout\"\n\n<Callout type=\"tip\" title=\"Hi\">**bold** body</Callout>\n\n<Tabs><Tab label=\"A\" open>x</Tab></Tabs>\n"));
		expect(r.errors).toEqual([]); expect(r.warnings).toEqual([]); expect(r.unknownComponents).toEqual([]);
		expect(r.html).toContain('HI'); expect(r.html).toContain('<strong>bold</strong>'); expect(r.html).toContain('<summary');
	});
	it('flags unknown components, foreign imports, exports and server APIs (same rules as the server)', async () => {
		const r = await compileMdx(fm("import fs from 'node:fs'\n\n<Evil />\n\nexport const a = 1\n\n{process.env.X}\n"));
		expect(r.ok).toBe(true);
		expect(r.errors.map((e) => e.line)).toEqual([4, 6, 8, 10]);
		expect(r.errors[1].message).toContain('Unknown component <Evil>');
		expect(r.unknownComponents).toEqual(['Evil']);
	});
	it('handles Persian/RTL text', async () => {
		const r = await compileMdx(fm('## سلام\n\nمتن **فارسی**'));
		expect(r.html).toContain('<strong>فارسی</strong>');
	});
});

describe('convertObsidian', () => {
	it('converts embeds, highlights, callouts, comments and keeps line count', () => {
		const src = fm('![[a b.png|Alt]]\n![[clip.mp4]]\n==hi== %%x\ny%%z\n> [!tip] Title\n> body\n');
		const out = convertObsidian(src);
		expect(out).toContain('![Alt](a%20b.png)');
		expect(out).toContain('<video controls preload="metadata" src="clip.mp4"></video>');
		expect(out).toContain('<mark>hi</mark>');
		expect(out).toContain('> **Title**');
		expect(out.split('\n').length).toBe(src.split('\n').length);
	});
	it('resolves wikilinks and leaves code alone', () => {
		const out = convertObsidian('See [[Vegord|the tool]] and `[[X]]`\n```\n[[Y]] ==z==\n```', { resolveLink: (t) => (t === 'Vegord' ? '/en/projects/vegord/' : null) });
		expect(out).toContain('[the tool](/en/projects/vegord/)');
		expect(out).toContain('`[[X]]`');
		expect(out).toContain('[[Y]] ==z==');
	});
});

describe('frontmatter', () => {
	it('parses meta including tags and faq', () => {
		const m = parseMeta('---\ntitle: "A"\nlang: fa\ntags:\n  - rust\n  - tls\nfaq:\n  - q: "Why?"\n    a: "Because."\n---\nx');
		expect(m).toMatchObject({ title: 'A', lang: 'fa', tags: ['rust', 'tls'], faq: [{ q: 'Why?', a: 'Because.' }] });
	});
	it('sets keys without touching other lines and slugifies Persian', () => {
		const out = setKeys('---\ntitle: "A"\ntags: [x]\n---\nbody', { lang: 'en', slug: 'a' });
		expect(out).toBe('---\ntitle: "A"\ntags: [x]\nlang: "en"\nslug: "a"\n---\nbody');
		expect(slugify('تکه‌تکه سازی TLS!')).toBe('تکه-تکه-سازی-tls');
	});
	it('new note template is valid frontmatter', () => {
		const t = newNoteTemplate({ title: 'Hello "x"', lang: 'fa', date: '2026-10-08' });
		expect(parseMeta(t)).toMatchObject({ title: 'Hello "x"', lang: 'fa', date: '2026-10-08' });
	});
});

describe('checkPage', () => {
	it('flags missing summary, H1 in body, empty alt and compile errors', () => {
		const src = '---\ntitle: "Short"\n---\n# Heading\n![](a.png)\n';
		const c = checkPage(src, { ok: false, html: '', headings: [], warnings: [], ms: 1, unknownComponents: [], errors: [{ line: 5, column: 1, message: 'bad' }] }, ['a.png']);
		const texts = c.map((x) => x.text).join('|');
		expect(texts).toContain('Missing `summary`'); expect(texts).toContain('H1'); expect(texts).toContain('empty alt'); expect(texts).toContain('Line 5: bad'); expect(texts).toContain('a.png');
	});
});

describe('error explanation', () => {
	it('gives the offending line, caret column and a fix hint for stray `<`', async () => {
		const src = '---\ntitle: "T"\n---\nok line\nUse Vec<u8>.len() here\n';
		const r = await compileMdx(src);
		expect(r.ok).toBe(false);
		expect(r.errors[0].line).toBe(5);
		expect(r.errors[0].excerpt).toBe('Use Vec<u8>.len() here');
		expect(r.errors[0].hint).toContain('backticks');
		const c = checkPage(src, r).find((x) => x.level === 'error')!;
		expect(c).toMatchObject({ line: 5 });
		expect(c.detail).toContain('^');
	});
	it('explains stray braces', async () => {
		const r = await compileMdx('---\ntitle: "T"\n---\nobject {a: 1 here\n');
		expect(r.errors[0].hint).toBeDefined();
	});
});

describe('unclosed tag position', () => {
	it('uses the (line:col) MDX puts in the message', async () => {
		const r = await compileMdx('---\ntitle: "T"\n---\na\n\n<Unclosed>\n');
		expect(r.errors[0]).toMatchObject({ line: 6, column: 1, excerpt: '<Unclosed>' });
	});
});

describe('open tag detection', () => {
	it('points at the tag that never closed (the pasted <video> case)', async () => {
		const src = '---\ntitle: "T"\n---\n\n<video\ncontrols\nwidth="100%"\n\nYour browser does not support the video element.\n';
		const r = await compileMdx(src);
		expect(r.errors[0].line).toBe(9);
		expect(r.errors[0].hint).toContain('<video> opened on line 5 never ends with ">"');
	});
});
