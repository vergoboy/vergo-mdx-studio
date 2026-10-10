/**
 * Obsidian-flavoured Markdown → MDX that the website understands. Pure and line-preserving
 * where possible so compile errors still point at the right line in the editor.
 */
import { split } from './frontmatter';

export const IMAGE_EXT = /\.(png|jpe?g|webp|avif|gif|svg)$/i;
export const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv)$/i;
export const AUDIO_EXT = /\.(mp3|ogg|wav)$/i;
export const MEDIA_EXT = /\.(png|jpe?g|webp|avif|gif|svg|mp4|webm|mov|m4v|ogv|mp3|ogg|wav|pdf)$/i;

function outsideCode(text: string, fn: (chunk: string) => string): string {
	const out: string[] = [];
	const fence = /^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm;
	let last = 0;
	const inline = (c: string) => c.split(/(`[^`\n]*`)/g).map((p, i) => (i % 2 ? p : fn(p))).join('');
	for (const m of text.matchAll(fence)) { out.push(inline(text.slice(last, m.index)), m[0]); last = (m.index ?? 0) + m[0].length; }
	out.push(inline(text.slice(last)));
	return out.join('');
}

export interface ConvertOptions {
	/** Public target for a wikilink (note name), or null to render plain text. */
	resolveLink?: (target: string) => string | null;
}

const escAttr = (s: string) => s.replace(/"/g, '&quot;');
const encPath = (p: string) => encodeURI(p).replace(/\(/g, '%28').replace(/\)/g, '%29');

export function convertObsidian(src: string, opts: ConvertOptions = {}): string {
	const { raw, body, has } = split(src);
	const head = has ? src.slice(0, src.length - body.length) : '';
	void raw;
	const out = outsideCode(body, (chunk) => {
		let s = chunk;
		s = s.replace(/%%[\s\S]*?%%/g, (m) => '\n'.repeat((m.match(/\n/g) ?? []).length)); // comments
		s = s.replace(/!\[\[([^\]|#]+?)(?:\|([^\]]*))?\]\]/g, (_m, file: string, alias?: string) => {
			const name = file.trim();
			const label = alias && !/^\d+(x\d+)?$/.test(alias.trim()) ? alias.trim() : '';
			if (IMAGE_EXT.test(name)) return `![${label || name.replace(/\.[^.]+$/, '')}](${encPath(name)})`;
			if (VIDEO_EXT.test(name)) return `<video controls preload="metadata" src="${escAttr(encPath(name))}"></video>`;
			if (AUDIO_EXT.test(name)) return `<audio controls src="${escAttr(encPath(name))}"></audio>`;
			if (/\.pdf$/i.test(name)) return `[${label || name}](${encPath(name)})`;
			return ''; // note embeds have no web equivalent
		});
		s = s.replace(/\[\[([^\]|#]+?)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g, (_m, target: string, heading?: string, alias?: string) => {
			const text = (alias ?? heading ?? target).trim();
			const url = opts.resolveLink?.(target.trim()) ?? null;
			if (!url) return text;
			const slug = heading ? `#${heading.normalize('NFC').toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-')}` : '';
			return `[${text}](${url}${slug})`;
		});
		s = s.replace(/==([^=\n][^\n]*?)==/g, '<mark>$1</mark>');
		s = s.replace(/^(\s*>\s*)\[!(\w+)\][+-]?[ \t]*(.*)$/gm, (_m, p: string, kind: string, title: string) => `${p}**${title.trim() || kind[0].toUpperCase() + kind.slice(1).toLowerCase()}**`);
		s = s.replace(/[ \t]+\^[A-Za-z0-9-]+[ \t]*$/gm, '');
		return s;
	});
	return head + out;
}
