import { ItemView, MarkdownView, Notice, TFile, WorkspaceLeaf, debounce } from 'obsidian';
import { checkPage } from '../mdx/checks';
import { compileMdx, type CompileResult } from '../mdx/compile';
import { parseMeta, split } from '../mdx/frontmatter';
import { convertObsidian } from '../mdx/obsidianSyntax';
import { findLocalMedia, rewriteMedia } from '../publish/media';
import { buildShell } from './pageShell';
import snapshot from './site.snapshot.csstxt';
import { loadSiteCss } from './siteCss';
import type StudioPlugin from '../main';

export const VIEW_TYPE = 'vergo-mdx-preview';

export class PreviewView extends ItemView {
	file: TFile | null = null;
	private frame!: HTMLIFrameElement; private checksEl!: HTMLElement; private statusEl!: HTMLElement;
	private theme: 'dark' | 'light';
	constructor(leaf: WorkspaceLeaf, private plugin: StudioPlugin) { super(leaf); this.theme = plugin.settings.previewTheme; }

	getViewType() { return VIEW_TYPE; }
	getDisplayText() { return this.file ? `Preview: ${this.file.basename}` : 'MDX preview'; }
	getIcon() { return 'eye'; }

	async onOpen() {
		const root = this.contentEl; root.empty(); root.addClass('vms-preview');
		const bar = root.createDiv({ cls: 'vms-bar' });
		const btn = (label: string, fn: () => void) => bar.createEl('button', { text: label }).addEventListener('click', fn);
		btn('Compile', () => void this.compileNow());
		btn('Send to site…', () => void this.plugin.publishFile(this.file));
		btn('☾/☀', () => { this.theme = this.theme === 'dark' ? 'light' : 'dark'; void this.render(); });
		btn('↻', () => void this.render());
		this.statusEl = bar.createSpan({ cls: 'vms-status-text' });
		this.checksEl = root.createDiv({ cls: 'vms-checks' });
		this.frame = root.createEl('iframe', { cls: 'vms-frame' });
		this.frame.setAttribute('sandbox', 'allow-same-origin');
		void this.render();
	}

	setFile(file: TFile | null) { if (file?.path !== this.file?.path) { this.file = file; void this.render(); } }
	readonly refresh = debounce(() => void this.render(), 350, true);

	async currentSource(): Promise<string> {
		if (!this.file) return '';
		const mv = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (mv?.file?.path === this.file.path) return mv.editor.getValue();
		return this.app.vault.read(this.file);
	}

	/** Compile + checks; shown in the toolbar and the checks list. */
	/** Put the cursor on the offending line of the note. */
	async jumpTo(line: number, column: number) {
		if (!this.file) return;
		let leaf = this.app.workspace.getLeavesOfType('markdown').find((l) => (l.view as MarkdownView).file?.path === this.file!.path);
		if (!leaf) { leaf = this.app.workspace.getLeaf('tab'); await leaf.openFile(this.file); }
		this.app.workspace.setActiveLeaf(leaf, { focus: true });
		const ed = (leaf.view as MarkdownView).editor;
		const pos = { line: Math.max(0, line - 1), ch: Math.max(0, column - 1) };
		ed.setCursor(pos); ed.scrollIntoView({ from: pos, to: pos }, true);
	}

	async compileNow() {
		const r = await this.render();
		if (!r) return;
		new Notice(r.ok && r.errors.length === 0 ? `✔ MDX compiled in ${r.ms} ms` : `✖ ${r.errors[0]?.message ?? 'compile error'} (line ${r.errors[0]?.line})`);
	}

	async render(): Promise<CompileResult | null> {
		if (!this.frame) return null;
		if (!this.file) { this.frame.srcdoc = '<p style="font:14px system-ui;padding:20px;color:#888">Open an .mdx note to preview it.</p>'; this.checksEl.empty(); return null; }
		const source = await this.currentSource();
		const meta = parseMeta(source);
		const lang: 'en' | 'fa' = meta.lang === 'en' ? 'en' : meta.lang === 'fa' ? 'fa' : this.plugin.settings.defaultLang;
		// media: preview with the vault's own resource URLs
		const missing: string[] = []; const map = new Map<string, string>();
		let text = convertObsidian(source);
		for (const ref of findLocalMedia(text)) {
			const f = this.app.metadataCache.getFirstLinkpathDest(ref.split(/[?#]/)[0], this.file.path);
			if (f) map.set(ref, this.app.vault.getResourcePath(f)); else missing.push(ref);
		}
		text = rewriteMedia(text, map);
		const compiled = await compileMdx(text);
		const css = await loadSiteCss(this.plugin.settings.siteUrl.replace(/\/+$/, ''), lang, this.plugin.http, snapshot, this.plugin.settings.previewStyles);
		const words = split(source).body.split(/\s+/).filter(Boolean).length;
		const image = meta.image ? (map.get(meta.image) ?? undefined) : undefined;
		this.frame.srcdoc = compiled.ok
			? buildShell({ lang, collection: this.plugin.settings.defaultCollection, title: meta.title ?? this.file.basename, summary: meta.summary ?? '', tags: meta.tags, date: meta.date, updated: meta.updated,
				image, imageAlt: meta.imageAlt, faq: meta.faq, bodyHtml: compiled.html, headings: compiled.headings, readingMin: Math.max(1, Math.round(words / 200)), theme: this.theme, siteUrl: this.plugin.settings.siteUrl.replace(/\/+$/, ''), css })
			: `<pre style="font:13px ui-monospace,monospace;padding:20px;color:#f08700;white-space:pre-wrap">MDX error\n\n${compiled.errors.map((e) => `Line ${e.line}, col ${e.column}: ${e.message}\n\n${e.excerpt ?? ''}\n${' '.repeat(Math.max(0, e.column - 1))}^\n\n${e.hint ?? ''}`).join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`;
		this.statusEl.setText(`${compiled.ok && compiled.errors.length === 0 ? '✔ compiled' : `✖ ${compiled.errors.length} problem(s)`} · ${compiled.ms} ms · ${css.source === 'live' ? 'live site styles' : 'bundled styles'} · v${this.plugin.manifest.version}`);
		this.checksEl.empty();
		for (const c of checkPage(source, compiled, missing)) {
			const row = this.checksEl.createDiv({ cls: `vms-check vms-${c.level}` });
			row.createSpan({ text: `${c.level === 'error' ? '✖' : c.level === 'warn' ? '▲' : '•'} ${c.text}` });
			if (c.detail) row.createEl('pre', { text: c.detail });
			if (c.line) { row.addClass('vms-jump'); row.setAttr('title', 'Jump to this line'); row.addEventListener('click', () => void this.jumpTo(c.line!, c.column ?? 1)); }
		}
		return compiled;
	}
}
