/** Find local media a note uses, hash it, and rewrite the references to the server's asset URLs. */
import { MEDIA_EXT } from '../mdx/obsidianSyntax';

export interface MediaRef { path: string }
export interface ResolvedMedia { name: string; ext: string; bytes: number; data: ArrayBuffer; source: string }
export const SERVER_PREFIX = '/media/studio/';

const isLocal = (p: string) => p !== '' && !/^([a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(p);

/** Every local media path referenced via markdown images, HTML/JSX src/poster, or frontmatter `image:`. */
export function findLocalMedia(text: string): string[] {
	const found = new Set<string>();
	const add = (p: string) => { const d = safeDecode(p.trim().replace(/^<|>$/g, '')); if (isLocal(d) && MEDIA_EXT.test(d.split(/[?#]/)[0])) found.add(d); };
	for (const m of text.matchAll(/!\[[^\]]*\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\s*\)/g)) add(m[1]);
	for (const m of text.matchAll(/\b(?:src|poster)\s*=\s*(?:"([^"]+)"|'([^']+)'|\{\s*["']([^"']+)["']\s*\})/g)) add(m[1] ?? m[2] ?? m[3]);
	const fm = /^image\s*:\s*(.+)$/m.exec(text.slice(0, Math.max(0, text.indexOf('\n---', 4))));
	if (fm) add(fm[1].replace(/^["']|["']$/g, ''));
	return [...found];
}

function safeDecode(s: string) { try { return decodeURIComponent(s); } catch { return s; } }

export async function sha256Hex(data: ArrayBuffer | string): Promise<string> {
	const buf = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
	return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function assetName(data: ArrayBuffer, fileName: string): Promise<string> {
	const ext = (/\.([a-z0-9]+)$/i.exec(fileName)?.[1] ?? '').toLowerCase().replace('jpeg', 'jpg');
	return `${(await sha256Hex(data)).slice(0, 16)}.${ext}`;
}

/** Replace each original reference (raw or percent-encoded) with its server URL. */
export function rewriteMedia(text: string, map: Map<string, string>): string {
	let out = text;
	for (const [orig, url] of [...map].sort((a, b) => b[0].length - a[0].length)) {
		for (const variant of new Set([orig, encodeURI(orig), encodeURI(orig).replace(/\(/g, '%28').replace(/\)/g, '%29')])) out = out.split(variant).join(url);
	}
	return out;
}
