/** Preview-only DOM renderers for the website's built-in MDX components. */
import { append } from './runtime';

type P = Record<string, unknown>;

function el(tag: string, style = '', text?: string): HTMLElement {
	const e = document.createElement(tag); if (style) e.setAttribute('style', style); if (text) e.textContent = text; return e;
}
const kids = (host: HTMLElement, c: unknown) => append(host, c);
const card = 'border:1px solid var(--line,#252732);border-radius:16px;padding:14px 16px;margin:16px 0;background:var(--surface,#0d1018)';

const COLORS: Record<string, [string, string]> = { note: ['#f08700', '✎'], info: ['#4f9dff', 'ℹ'], tip: ['#3fb950', '✦'], warning: ['#d9a400', '▲'], danger: ['#e5484d', '✖'] };

export const siteComponents: Record<string, (p: P) => Node> = {
	Callout(p) {
		const [color, icon] = COLORS[String(p.type ?? 'note')] ?? COLORS.note;
		const box = el('aside', `${card};border-inline-start:4px solid ${color}`);
		box.appendChild(el('p', `margin:0;font-weight:600;color:${color}`, `${icon} ${String(p.title ?? p.type ?? 'note').toUpperCase()}`));
		const body = el('div', 'margin-top:4px;color:var(--muted,#9b9a96)'); kids(body, p.children); box.appendChild(body); return box;
	},
	Card(p) {
		const box = el(p.href ? 'a' : 'div', `${card};display:block;text-decoration:none;color:inherit`);
		if (p.href) box.setAttribute('href', String(p.href));
		box.appendChild(el('p', 'margin:0;font-weight:600', String(p.title ?? '')));
		const body = el('div', 'margin-top:4px;font-size:14px;color:var(--muted,#9b9a96)'); kids(body, p.children); box.appendChild(body); return box;
	},
	Tabs(p) { const d = el('div', 'margin:16px 0'); kids(d, p.children); return d; },
	Tab(p) {
		const d = el('details', `${card};padding:0`); if (p.open) d.setAttribute('open', '');
		d.appendChild(el('summary', 'cursor:pointer;padding:10px 14px;font-weight:500', String(p.label ?? 'Tab')));
		const body = el('div', 'border-top:1px solid var(--line,#252732);padding:12px 14px'); kids(body, p.children); d.appendChild(body); return d;
	},
	YouTube(p) {
		const id = String(p.id ?? /(?:v=|youtu\.be\/|embed\/)([\w-]{11})/.exec(String(p.url ?? ''))?.[1] ?? '');
		const a = el('a', `${card};display:grid;place-content:center;justify-items:center;gap:10px;aspect-ratio:16/9;text-decoration:none;color:inherit;margin:16px 0`);
		a.setAttribute('href', id ? `https://www.youtube.com/watch?v=${id}` : '#');
		a.appendChild(el('span', 'font-size:34px;color:#f08700', '▶')); a.appendChild(el('span', 'font-size:12px;color:var(--muted,#9b9a96)', `YouTube · ${p.title ?? id ?? 'missing id'}`)); return a;
	},
	AudioPlayer(p) {
		const f = el('figure', 'margin:16px 0'); const a = el('audio', 'width:100%'); a.setAttribute('controls', ''); a.setAttribute('preload', 'none'); a.setAttribute('src', String(p.src ?? ''));
		f.appendChild(a); if (p.title) f.appendChild(el('figcaption', 'font-size:13px;color:var(--muted,#9b9a96)', String(p.title))); return f;
	},
	VideoPlayer(p) {
		const f = el('figure', 'margin:16px 0'); const v = el('video', 'width:100%;border-radius:12px'); v.setAttribute('controls', ''); v.setAttribute('preload', 'metadata'); v.setAttribute('src', String(p.src ?? ''));
		if (p.poster) v.setAttribute('poster', String(p.poster));
		f.appendChild(v); if (p.title) f.appendChild(el('figcaption', 'font-size:13px;color:var(--muted,#9b9a96)', String(p.title))); return f;
	},
};
