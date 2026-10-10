import { describe, it, expect, vi } from 'vitest';
import { defaultChoice, prepareSubmission, send } from './flow';
import { StudioClient, StudioError, type HttpFn } from './client';

const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
const vaultFiles: Record<string, { name: string; path: string; data: ArrayBuffer }> = {
	'img/cover.png': { name: 'cover.png', path: 'img/cover.png', data: bytes('PNGDATA') },
	'clip.mp4': { name: 'clip.mp4', path: 'clip.mp4', data: bytes('VIDEODATA') },
};
const app: any = {
	metadataCache: { getFirstLinkpathDest: (p: string) => vaultFiles[p] ?? Object.values(vaultFiles).find((f) => f.name === p) ?? null },
	vault: { readBinary: async (f: any) => f.data },
};
const file: any = { path: 'Posts/Hello.mdx', basename: 'Hello' };
const src = '---\ntitle: "Hello"\nlang: en\n---\n![[cover.png|Cover]]\n\n![x](img/cover.png)\n\n![[clip.mp4]]\n\nText {1+1}\n';

describe('defaultChoice', () => {
	it('uses frontmatter, then settings; slugifies the file name', () => {
		expect(defaultChoice(src, file, { lang: 'fa', collection: 'journal' })).toEqual({ lang: 'en', collection: 'journal', slug: 'hello' });
		expect(defaultChoice('no fm', { basename: 'مقاله جدید' }, { lang: 'fa', collection: 'projects' })).toEqual({ lang: 'fa', collection: 'projects', slug: 'مقاله-جدید' });
	});
});

describe('prepareSubmission', () => {
	it('hashes media, dedupes, rewrites urls and sets lang/slug', async () => {
		const p = await prepareSubmission(app, file, src, { lang: 'fa', collection: 'journal', slug: 'hello' });
		expect(p.compileErrors).toEqual([]); expect(p.missing).toEqual([]);
		expect(p.media).toHaveLength(2);
		const names = p.media.map((m) => m.name);
		expect(names.every((n) => /^[a-f0-9]{16}\.(png|mp4)$/.test(n))).toBe(true);
		expect(p.submission.content).not.toContain('cover.png)');
		expect(p.submission.content).toContain(`/media/studio/${names[0]}`);
		expect(p.submission.content).toContain('lang: "fa"');
		expect(p.submission.media).toEqual(names);
	});
	it('reports missing media and compile errors instead of throwing', async () => {
		const p = await prepareSubmission(app, file, '---\ntitle: "x"\n---\n![a](nope.png)\n\n<broken>\n', { lang: 'en', collection: 'journal', slug: 'x' });
		expect(p.missing).toEqual(['nope.png']);
		expect(p.compileErrors.length).toBe(1);
	});
});

describe('send', () => {
	const mk = (handler: (path: string, body?: unknown) => { status: number; json?: unknown }) => {
		const calls: { path: string; method: string }[] = [];
		const http: HttpFn = async (r) => { const path = r.url.replace('https://s.test', ''); calls.push({ path, method: r.method }); return handler(path, r.body); };
		return { client: new StudioClient({ siteUrl: 'https://s.test/', token: 't' }, http), calls };
	};

	it('uploads only the media the server lacks, then submits', async () => {
		const p = await prepareSubmission(app, file, src, { lang: 'en', collection: 'journal', slug: 'hello' });
		const { client, calls } = mk((path) => {
			if (path.startsWith('/api/studio/ping')) return { status: 200, json: { ok: true } };
			if (path.endsWith('/media/check')) return { status: 200, json: { missing: [p.media[1].name] } };
			if (path.startsWith('/api/studio/media?')) return { status: 200, json: {} };
			return { status: 200, json: { id: 'abc', key: 'journal/en/hello', status: 'pending' } };
		});
		const progress = vi.fn();
		expect(await send(client, p, progress)).toMatchObject({ id: 'abc' });
		expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
		expect(calls.at(-1)).toEqual({ path: '/api/studio/submissions', method: 'POST' });
	});

	it('refuses to send when media is missing or MDX is broken, and maps server errors', async () => {
		const bad = await prepareSubmission(app, file, '---\ntitle: "x"\n---\n![a](nope.png)\n', { lang: 'en', collection: 'journal', slug: 'x' });
		await expect(send(mk(() => ({ status: 200 })).client, bad, () => {})).rejects.toThrow(/Media not found/);
		const ok = await prepareSubmission(app, file, src, { lang: 'en', collection: 'journal', slug: 'hello' });
		const { client } = mk((path) => (path.includes('ping') ? { status: 401, json: {} } : { status: 200, json: {} }));
		await expect(send(client, ok, () => {})).rejects.toBeInstanceOf(StudioError);
		const { client: c2 } = mk((path) => (path.includes('submissions') ? { status: 422, json: { error: 'MDX does not compile', errors: [{ path: 'x.mdx', line: 3, message: 'bad' }] } } : { status: 200, json: { missing: [] } }));
		await expect(send(c2, ok, () => {})).rejects.toMatchObject({ status: 422, errors: [{ line: 3 }] });
	});
});

describe('error line numbers', () => {
	it('match the editor even though lang/slug lines are added for sending', async () => {
		const bad = '---\ntitle: "x"\n---\n\nfine\n\nUse Vec<u8>.len() here\n';
		const p = await prepareSubmission(app, file, bad, { lang: 'en', collection: 'journal', slug: 'x' });
		expect(p.compileDetails[0].line).toBe(7);
		expect(p.compileDetails[0].excerpt).toBe('Use Vec<u8>.len() here');
	});
});
