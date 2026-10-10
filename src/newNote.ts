import { App, Modal, Notice, Setting, TFolder, normalizePath } from 'obsidian';
import { newNoteTemplate } from './mdx/frontmatter';
import type { StudioSettings } from './settings';

const forbidden = /[\\/:*?"<>|#^[\]]/g;
export const cleanFileName = (t: string) => t.replace(forbidden, ' ').replace(/\s+/g, ' ').trim();

async function uniquePath(app: App, folder: string, base: string): Promise<string> {
	let n = 0;
	for (;;) {
		const p = normalizePath(`${folder}/${base}${n ? ` ${n}` : ''}.mdx`);
		if (!app.vault.getAbstractFileByPath(p)) return p;
		n++;
	}
}

export async function createMdxNote(app: App, folder: TFolder, title: string, lang: 'en' | 'fa'): Promise<void> {
	const name = cleanFileName(title) || 'Untitled';
	const path = await uniquePath(app, folder.isRoot() ? '' : folder.path, name);
	const file = await app.vault.create(path, newNoteTemplate({ title, lang, date: new Date().toISOString().slice(0, 10) }));
	await app.workspace.getLeaf(false).openFile(file);
	new Notice(`Created ${file.name}`);
}

/** "New MDX note" dialog: title + language, created in the folder you right-clicked. */
export class NewNoteModal extends Modal {
	private title = ''; private lang: 'en' | 'fa';
	constructor(app: App, private folder: TFolder, private settings: StudioSettings) { super(app); this.lang = settings.defaultLang; }
	onOpen() {
		this.titleEl.setText('New MDX note');
		new Setting(this.contentEl).setName('Title').addText((t) => { t.setPlaceholder('My article').onChange((v) => (this.title = v)); window.setTimeout(() => t.inputEl.focus(), 30);
			t.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') void this.go(); }); });
		new Setting(this.contentEl).setName('Language').addDropdown((d) => d.addOptions({ en: 'English', fa: 'فارسی' }).setValue(this.lang).onChange((v) => (this.lang = v as 'en' | 'fa')));
		new Setting(this.contentEl).addButton((b) => b.setButtonText('Create').setCta().onClick(() => void this.go()));
	}
	private async go() {
		if (!this.title.trim()) { new Notice('Enter a title first.'); return; }
		this.close();
		await createMdxNote(this.app, this.folder, this.title.trim(), this.lang);
	}
	onClose() { this.contentEl.empty(); }
}
