/** Turns a note into a submission: convert syntax, find + hash media, rewrite URLs, validate. */
import type { App, TFile } from 'obsidian';
import { compileMdx, type CompileError } from '../mdx/compile';
import { parseMeta, setKeys, slugify } from '../mdx/frontmatter';
import { convertObsidian } from '../mdx/obsidianSyntax';
import { assetName, findLocalMedia, rewriteMedia, SERVER_PREFIX } from './media';
import { StudioClient, StudioError, type Submission } from './client';

export interface Choice { lang: 'en' | 'fa'; collection: 'journal' | 'projects'; slug: string }
export interface PreparedMedia { name: string; original: string; bytes: number; data: ArrayBuffer }
export interface Prepared { submission: Submission; media: PreparedMedia[]; missing: string[]; compileErrors: string[]; compileDetails: CompileError[]; title: string }

export function defaultChoice(source: string, file: { basename: string }, d: { lang: 'en' | 'fa'; collection: 'journal' | 'projects' }): Choice {
	const m = parseMeta(source);
	return {
		lang: m.lang === 'en' || m.lang === 'fa' ? m.lang : d.lang,
		collection: d.collection,
		slug: m.slug || slugify(file.basename) || 'untitled',
	};
}

export async function prepareSubmission(app: App, file: TFile, source: string, choice: Choice): Promise<Prepared> {
	// Compile the note as written so error lines match the editor; the keys added below shift lines.
	const converted = convertObsidian(source);
	const c = await compileMdx(converted);
	let text = setKeys(converted, { lang: choice.lang, slug: choice.slug });
	const media: PreparedMedia[] = []; const missing: string[] = []; const map = new Map<string, string>();
	for (const ref of findLocalMedia(text)) {
		const f = app.metadataCache.getFirstLinkpathDest(ref.split(/[?#]/)[0], file.path);
		if (!f) { missing.push(ref); continue; }
		const data = await app.vault.readBinary(f);
		const name = await assetName(data, f.name);
		map.set(ref, `${SERVER_PREFIX}${name}`);
		if (!media.some((m) => m.name === name)) media.push({ name, original: f.path, bytes: data.byteLength, data });
	}
	text = rewriteMedia(text, map);
	return {
		submission: { collection: choice.collection, lang: choice.lang, slug: choice.slug, ext: 'mdx', content: text, media: media.map((m) => m.name), vaultPath: file.path },
		media, missing, compileErrors: c.errors.map((e) => `Line ${e.line}: ${e.message}`), compileDetails: c.errors, title: parseMeta(text).title ?? file.basename,
	};
}

export type Progress = (msg: string, done?: number, total?: number) => void;

export async function send(client: StudioClient, p: Prepared, progress: Progress): Promise<{ id: string; key: string }> {
	if (p.missing.length) throw new StudioError(`Media not found in the vault: ${p.missing.join(', ')}`);
	if (p.compileErrors.length) throw new StudioError(`MDX does not compile: ${p.compileErrors[0]}`);
	progress('Checking the server…');
	await client.ping();
	const missing = new Set(await client.missingMedia(p.media.map((m) => m.name)));
	const todo = p.media.filter((m) => missing.has(m.name));
	let done = 0;
	for (const m of todo) {
		progress(`Uploading ${m.original} (${(m.bytes / 1048576).toFixed(1)} MB)…`, done, todo.length);
		await client.uploadMedia(m.name, m.data);
		done++;
	}
	progress('Sending the page…', todo.length, todo.length);
	return client.submit(p.submission);
}
