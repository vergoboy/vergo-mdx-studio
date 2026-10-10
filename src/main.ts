import { MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder, requestUrl, type App, type Menu, type TAbstractFile } from 'obsidian';
import { NewNoteModal } from './newNote';
import { PreviewView, VIEW_TYPE } from './preview/previewView';
import { StudioClient, StudioError, type HttpFn } from './publish/client';
import { PublishModal } from './publish/publishModal';
import { DEFAULT_SETTINGS, type StudioSettings } from './settings';

export default class StudioPlugin extends Plugin {
	settings: StudioSettings = { ...DEFAULT_SETTINGS };

	/** Obsidian's requestUrl: no CORS problems and works on mobile. */
	readonly http: HttpFn = async (req) => {
		const res = await requestUrl({ url: req.url, method: req.method, headers: req.headers, body: req.body, contentType: req.headers['content-type'], throw: false });
		let json: unknown; try { json = res.json; } catch { json = undefined; }
		return { status: res.status, json, text: res.text };
	};

	async onload() {
		await this.loadSettings();
		this.registerExtensions(['mdx'], 'markdown'); // makes .mdx files open in the editor
		this.registerView(VIEW_TYPE, (leaf) => new PreviewView(leaf, this));
		this.addRibbonIcon('eye', 'MDX preview', () => void this.openPreview());
		this.addSettingTab(new StudioSettingTab(this.app, this));

		this.addCommand({ id: 'new-mdx-note', name: 'New MDX note', callback: () => this.newNote(this.app.fileManager.getNewFileParent(this.app.workspace.getActiveFile()?.path ?? '')) });
		this.addCommand({ id: 'open-preview', name: 'Open website preview', callback: () => void this.openPreview() });
		this.addCommand({ id: 'compile', name: 'Compile this note', callback: async () => { const v = await this.openPreview(); await v?.compileNow(); } });
		this.addCommand({ id: 'send', name: 'Send this note to the website (needs approval)', callback: () => void this.publishFile(this.app.workspace.getActiveFile()) });

		// right-click in the file explorer
		this.registerEvent(this.app.workspace.on('file-menu', (menu: Menu, f: TAbstractFile) => {
			const folder = f instanceof TFolder ? f : f.parent;
			if (folder) menu.addItem((i) => i.setTitle('New MDX note').setIcon('file-code').onClick(() => this.newNote(folder)));
			if (f instanceof TFile && f.extension === 'mdx') {
				menu.addItem((i) => i.setTitle('Preview MDX').setIcon('eye').onClick(() => void this.openPreview(f)));
				menu.addItem((i) => i.setTitle('Send to website…').setIcon('upload-cloud').onClick(() => void this.publishFile(f)));
			}
		}));

		// keep the preview in sync
		this.registerEvent(this.app.workspace.on('editor-change', (_e, info) => { if (info.file && this.preview()?.file?.path === info.file.path) this.preview()?.refresh(); }));
		this.registerEvent(this.app.workspace.on('file-open', (f) => { if (f?.extension === 'mdx') this.preview()?.setFile(f); }));
	}

	private preview(): PreviewView | null { return (this.app.workspace.getLeavesOfType(VIEW_TYPE)[0]?.view as PreviewView | undefined) ?? null; }

	async openPreview(file?: TFile): Promise<PreviewView | null> {
		const target = file ?? this.app.workspace.getActiveFile();
		let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
		if (!leaf) { leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf('split'); await leaf.setViewState({ type: VIEW_TYPE, active: true }); }
		void this.app.workspace.revealLeaf(leaf);
		const view = leaf.view as PreviewView;
		view.setFile(target && target.extension === 'mdx' ? target : view.file);
		return view;
	}

	newNote(folder: TFolder) { new NewNoteModal(this.app, folder, this.settings).open(); }

	async publishFile(file: TFile | null) {
		if (!file || file.extension !== 'mdx') { new Notice('Open an .mdx note first.'); return; }
		if (!this.settings.token.trim()) { new Notice('Add your site token in Vergo MDX Studio settings first.'); return; }
		const mv = this.app.workspace.getActiveViewOfType(MarkdownView);
		const source = mv?.file?.path === file.path ? mv.editor.getValue() : await this.app.vault.read(file);
		new PublishModal(this.app, file, source, this.settings, new StudioClient(this.settings, this.http)).open();
	}

	async loadSettings() { this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) }; }
	async saveSettings() { await this.saveData(this.settings); }
}

class StudioSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: StudioPlugin) { super(app, plugin); }
	display() {
		const { containerEl: c } = this; c.empty();
		const s = this.plugin.settings;
		new Setting(c).setName('Site URL').addText((t) => t.setValue(s.siteUrl).onChange(async (v) => { s.siteUrl = v.trim(); await this.plugin.saveSettings(); }));
		new Setting(c).setName('Token').setDesc('Dashboard ▸ Settings ▸ Studio tokens. Stored on this device only.')
			.addText((t) => { t.inputEl.type = 'password'; t.setPlaceholder('vgp_…').setValue(s.token).onChange(async (v) => { s.token = v.trim(); await this.plugin.saveSettings(); }); })
			.addButton((b) => b.setButtonText('Test').onClick(async () => {
				try { const r = await new StudioClient(s, this.plugin.http).ping(); new Notice(`✔ Connected as “${r.token}” · MDX check ${r.mdxValidation ? 'on' : 'OFF'} · media limit ${r.maxMediaMb} MB`); }
				catch (e) { new Notice(`✖ ${(e as StudioError).message}`); }
			}));
		new Setting(c).setName('Default language').addDropdown((d) => d.addOptions({ en: 'English', fa: 'فارسی' }).setValue(s.defaultLang).onChange(async (v) => { s.defaultLang = v as 'en' | 'fa'; await this.plugin.saveSettings(); }));
		new Setting(c).setName('Default type').addDropdown((d) => d.addOptions({ journal: 'Journal', projects: 'Project' }).setValue(s.defaultCollection).onChange(async (v) => { s.defaultCollection = v as 'journal' | 'projects'; await this.plugin.saveSettings(); }));
		new Setting(c).setName('Preview styles').setDesc('Auto uses the live site stylesheet when it is the current design, otherwise the copy bundled in the plugin.')
			.addDropdown((d) => d.addOptions({ auto: 'Auto', bundled: 'Bundled' }).setValue(s.previewStyles).onChange(async (v) => { s.previewStyles = v as 'auto' | 'bundled'; await this.plugin.saveSettings(); }));
		new Setting(c).setName('Preview theme').addDropdown((d) => d.addOptions({ dark: 'Dark', light: 'Light' }).setValue(s.previewTheme).onChange(async (v) => { s.previewTheme = v as 'dark' | 'light'; await this.plugin.saveSettings(); }));
	}
}
