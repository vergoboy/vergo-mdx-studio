/**
 * Styles for the preview. The live site's stylesheet is used only when it already is the current
 * design (it must contain the page classes); otherwise — old site online, offline, blocked —
 * the snapshot bundled in the plugin is used, so the preview is never unstyled.
 * CSS is fetched with requestUrl and inlined, because an iframe cannot be trusted to load
 * external stylesheets inside Obsidian.
 */
import type { HttpFn } from '../publish/client';

export interface SiteCss { inline: string; source: 'live' | 'bundled' }
const cache = new Map<string, { at: number; css: SiteCss }>();
const isCurrentDesign = (css: string) => css.includes('.prose-body') && css.includes('.wrap');

const absolutize = (css: string, base: string) =>
	css.replace(/url\(\s*(['"]?)(?!data:|https?:|\/\/)([^'")]+)\1\s*\)/g, (_m, q: string, u: string) => `url(${q}${new URL(u, base).href}${q})`);

export async function loadSiteCss(siteUrl: string, lang: 'en' | 'fa', http: HttpFn, bundled: string, mode: 'auto' | 'bundled' = 'auto'): Promise<SiteCss> {
	const fallback: SiteCss = { inline: bundled, source: 'bundled' };
	if (mode === 'bundled') return fallback;
	const key = `${siteUrl}|${lang}`;
	const hit = cache.get(key);
	if (hit && Date.now() - hit.at < 10 * 60_000) return hit.css;
	try {
		const page = await http({ url: `${siteUrl}/${lang}/`, method: 'GET', headers: {} });
		if (page.status !== 200 || !page.text) return fallback;
		const hrefs = [...page.text.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)]
			.map((m) => /href=["']([^"']+)["']/.exec(m[0])?.[1]).filter((h): h is string => Boolean(h))
			.map((h) => new URL(h, `${siteUrl}/`).href).slice(0, 6);
		let css = [...page.text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
		for (const href of hrefs) {
			const r = await http({ url: href, method: 'GET', headers: {} });
			if (r.status === 200 && r.text && r.text.length < 400_000) css += `\n${absolutize(r.text, href)}`;
		}
		if (isCurrentDesign(css)) { const out: SiteCss = { inline: css, source: 'live' }; cache.set(key, { at: Date.now(), css: out }); return out; }
	} catch { /* offline or blocked */ }
	return fallback;
}
