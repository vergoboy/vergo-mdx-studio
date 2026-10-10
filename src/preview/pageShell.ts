/**
 * Builds the HTML shown in the preview iframe. It reuses the website's own class names and
 * stylesheet (fetched from the live site), so what you see is what EntryPage.astro renders.
 */
import type { Faq } from '../mdx/frontmatter';

export interface ShellInput {
	lang: 'en' | 'fa';
	collection: 'journal' | 'projects';
	title: string; summary: string; tags: string[]; date?: string; updated?: string;
	image?: string; imageAlt?: string; faq: Faq[];
	bodyHtml: string; headings: { depth: number; text: string; id: string }[]; readingMin: number;
	theme: 'dark' | 'light'; siteUrl: string; css: { inline: string };
}

const L = {
	en: { quick: 'Quick answer', toc: 'On this page', faq: 'Frequently asked', by: 'By', published: 'Published', updated: 'Updated', min: 'min read', home: 'Home', journal: 'Journal', projects: 'Projects', name: 'Arman Hosseini' },
	fa: { quick: 'پاسخ کوتاه', toc: 'در این صفحه', faq: 'پرسش‌های متداول', by: 'نویسنده', published: 'انتشار', updated: 'به‌روزرسانی', min: 'دقیقه مطالعه', home: 'خانه', journal: 'یادداشت‌ها', projects: 'پروژه‌ها', name: 'آرمان حسینی' },
};
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function fmtDate(iso: string | undefined, lang: 'en' | 'fa'): string {
	if (!iso) return '';
	const d = new Date(iso); if (Number.isNaN(d.getTime())) return iso;
	return new Intl.DateTimeFormat(lang === 'fa' ? 'fa-IR-u-ca-persian' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(d);
}

export const FALLBACK_CSS = `
:root{--page:#07090f;--surface:#0d1018;--raised:#151824;--line:#252732;--primary:#f5fbef;--muted:#9b9a96;--accent:#f08700}
.light{--page:#f5fbef;--surface:#fff;--raised:#eef4e8;--line:#d9dfd2;--primary:#07090f;--muted:#55565c;--accent:#b45f00}
body{margin:0;background:var(--page);color:var(--primary);font:16px/1.8 system-ui,sans-serif}
.wrap{max-width:48rem;margin:auto;padding:24px}.card{border:1px solid var(--line);border-radius:16px;padding:16px;background:var(--surface)}
.chip{border:1px solid var(--line);border-radius:6px;padding:1px 8px;font:12px ui-monospace,monospace;color:var(--muted);margin-inline-end:6px}
.eyebrow{font:12px ui-monospace,monospace;color:var(--accent);text-transform:uppercase;letter-spacing:.1em}
.prose-body h2{border-bottom:1px solid var(--line);padding-bottom:.3rem;margin-top:2.5rem}.prose-body a{color:var(--accent)}
.prose-body pre{overflow:auto;border:1px solid var(--line);border-radius:12px;padding:14px;background:var(--surface);direction:ltr}
.prose-body img,.prose-body video{max-width:100%;border-radius:12px}.prose-body table{border-collapse:collapse}.prose-body td,.prose-body th{border:1px solid var(--line);padding:6px 10px}
`;

export function buildShell(i: ShellInput): string {
	const t = L[i.lang];
	const dir = i.lang === 'fa' ? 'rtl' : 'ltr';
	const section = i.collection === 'projects' ? t.projects : t.journal;
	const toc = i.headings.filter((h) => h.depth === 2 || h.depth === 3);
	const faq = i.faq.map((f) => `<details class="card group !p-0"><summary class="flex cursor-pointer list-none items-center justify-between gap-4 p-4 font-medium"><span>${esc(f.q)}</span></summary><p class="px-4 pb-4 leading-7 text-muted">${esc(f.a)}</p></details>`).join('');
	return `<!doctype html><html lang="${i.lang}" dir="${dir}" class="${i.theme}"><head><meta charset="utf-8">
<base href="${esc(i.siteUrl)}/"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${i.css.inline}</style><style>body{background:var(--page);color:var(--primary)}</style></head>
<body class="flex min-h-screen flex-col">
<header class="sticky top-0 z-40 border-b border-line/80 bg-page/80"><div class="wrap flex items-center gap-3 py-2.5"><b>${esc(t.name)}</b><span class="chip ms-auto" dir="ltr">PREVIEW · ${i.lang.toUpperCase()}</span></div></header>
<main class="wrap flex-1 py-10 sm:py-14"><article class="mx-auto max-w-3xl">
<nav class="font-mono text-xs text-muted"><ol class="flex flex-wrap items-center gap-1.5"><li>${esc(t.home)}</li><li>›</li><li>${esc(section)}</li><li>›</li><li class="text-primary">${esc(i.title)}</li></ol></nav>
<header class="mt-8"><h1 class="mt-2 text-3xl font-bold leading-tight tracking-tight sm:text-5xl">${esc(i.title || '…')}</h1>
<p class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted"><span>${esc(t.by)} <b class="text-primary">${esc(t.name)}</b></span>${i.date ? `<time>${esc(t.published)}: ${esc(fmtDate(i.date, i.lang))}</time>` : ''}${i.updated ? `<time>${esc(t.updated)}: ${esc(fmtDate(i.updated, i.lang))}</time>` : ''}<span>${i.readingMin} ${esc(t.min)}</span></p>
${i.tags.length ? `<ul class="mt-4 flex flex-wrap gap-2">${i.tags.map((x) => `<li><span class="chip" dir="auto">${esc(x)}</span></li>`).join('')}</ul>` : ''}</header>
${i.image ? `<img src="${esc(i.image)}" alt="${esc(i.imageAlt ?? '')}" class="mt-8 w-full rounded-2xl border border-line">` : ''}
${i.summary ? `<aside class="card mt-8" style="border-color:color-mix(in oklab,var(--accent) 40%,transparent)"><p class="eyebrow">✦ ${esc(t.quick)}</p><p class="mt-2 text-[1.05rem] leading-8">${esc(i.summary)}</p></aside>` : ''}
${toc.length > 2 ? `<nav class="card mt-8 !p-4"><p class="eyebrow">${esc(t.toc)}</p><ol class="mt-2 space-y-1 text-sm">${toc.map((h) => `<li${h.depth === 3 ? ' class="ps-4"' : ''}><a class="text-muted" href="#${esc(h.id)}">${esc(h.text)}</a></li>`).join('')}</ol></nav>` : ''}
<div class="prose-body mt-8">${i.bodyHtml}</div>
${faq ? `<section class="mt-14"><h2 class="text-2xl font-semibold tracking-tight">${esc(t.faq)}</h2><div class="mt-5 space-y-3">${faq}</div></section>` : ''}
</article></main></body></html>`;
}
