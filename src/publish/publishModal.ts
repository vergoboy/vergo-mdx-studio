import { App, Modal, Notice, Setting, type TFile } from 'obsidian';
import { defaultChoice, prepareSubmission, send, type Choice, type Prepared } from './flow';
import { StudioClient, StudioError } from './client';
import type { StudioSettings } from '../settings';
import { normalizeUrl } from '../settings';

const mb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Asks language + journal/project, shows the media that will travel along, then sends for approval. */
export class PublishModal extends Modal {
	private choice: Choice;
	private info!: HTMLElement; private status!: HTMLElement; private sendBtn!: HTMLButtonElement;
	constructor(app: App, private file: TFile, private source: string, private settings: StudioSettings, private client: StudioClient) {
		super(app);
		this.choice = defaultChoice(source, file, { lang: settings.defaultLang, collection: settings.defaultCollection });
	}

	onOpen() {
		this.titleEl.setText('Send to the website');
		const c = this.contentEl;
		c.createEl('p', { text: `${this.file.path}`, cls: 'mod-muted' });
		new Setting(c).setName('Language').setDesc('The page is published under /en/ or /fa/.')
			.addDropdown((d) => d.addOptions({ en: 'English', fa: 'فارسی' }).setValue(this.choice.lang).onChange((v) => { this.choice.lang = v as 'en' | 'fa'; void this.refresh(); }));
		new Setting(c).setName('Type').setDesc('Journal post or project page.')
			.addDropdown((d) => d.addOptions({ journal: 'Journal', projects: 'Project' }).setValue(this.choice.collection).onChange((v) => { this.choice.collection = v as 'journal' | 'projects'; void this.refresh(); }));
		new Setting(c).setName('Slug').setDesc('URL ending, e.g. my-article')
			.addText((t) => t.setValue(this.choice.slug).onChange((v) => { this.choice.slug = v.trim(); void this.refresh(); }));
		this.info = c.createDiv({ cls: 'vms-info' });
		this.status = c.createDiv({ cls: 'vms-status' });
		new Setting(c).addButton((b) => { b.setButtonText('Send for approval').setCta().onClick(() => void this.run()); this.sendBtn = b.buttonEl; })
			.addButton((b) => b.setButtonText('Cancel').onClick(() => this.close()));
		void this.refresh();
	}

	private prepared: Prepared | null = null;
	private async refresh() {
		this.info.empty();
		try { this.prepared = await prepareSubmission(this.app, this.file, this.source, this.choice); } catch (e) { this.info.createEl('p', { text: `Could not prepare the page: ${(e as Error).message}` }); return; }
		const p = this.prepared;
		const url = `${normalizeUrl(this.settings.siteUrl)}/${this.choice.lang}/${this.choice.collection}/${this.choice.slug}/`;
		this.info.createEl('p', { text: `Will appear at ${url} after you approve it in the dashboard.` });
		const total = p.media.reduce((n, m) => n + m.bytes, 0);
		this.info.createEl('p', { text: p.media.length ? `Media (${p.media.length}, ${mb(total)}):` : 'No media files.' });
		if (p.media.length) { const ul = this.info.createEl('ul'); for (const m of p.media) ul.createEl('li', { text: `${m.original} · ${mb(m.bytes)}` }); }
		for (const m of p.missing) this.info.createEl('p', { text: `⚠ Not found in the vault: ${m}`, cls: 'mod-warning' });
		for (const e of p.compileDetails) {
			this.info.createEl('p', { text: `✖ Line ${e.line}: ${e.message}`, cls: 'mod-warning' });
			if (e.excerpt) this.info.createEl('pre', { text: `${e.excerpt}\n${' '.repeat(Math.max(0, e.column - 1))}^` });
			if (e.hint) this.info.createEl('p', { text: e.hint, cls: 'mod-muted' });
		}
		this.sendBtn.disabled = p.missing.length > 0 || p.compileErrors.length > 0 || !this.choice.slug;
	}

	private async run() {
		if (!this.prepared) return;
		this.sendBtn.disabled = true;
		try {
			const r = await send(this.client, this.prepared, (msg, d, t) => this.status.setText(t ? `${msg} (${d}/${t})` : msg));
			this.status.setText(`✔ Sent. Open ${normalizeUrl(this.settings.siteUrl)}/admin/ ▸ Inbox to approve it. (id ${r.id})`);
			new Notice('Sent for approval.');
		} catch (e) {
			const err = e as StudioError;
			const detail = err.errors?.slice(0, 3).map((x) => `${x.path ?? ''}${x.line ? `:${x.line}` : ''} ${x.message}`).join('\n') ?? '';
			this.status.setText(`✖ ${err.message}${detail ? `\n${detail}` : ''}`);
			this.sendBtn.disabled = false;
		}
	}
	onClose() { this.contentEl.empty(); }
}
