export interface StudioSettings {
	siteUrl: string;
	token: string;
	defaultLang: 'en' | 'fa';
	defaultCollection: 'journal' | 'projects';
	previewTheme: 'dark' | 'light';
	/** auto = live site styles when they are the current design, else the bundled snapshot */
	previewStyles: 'auto' | 'bundled';
}
export const DEFAULT_SETTINGS: StudioSettings = {
	siteUrl: 'https://arman-hosseini.ir',
	token: '',
	defaultLang: 'fa',
	defaultCollection: 'journal',
	previewTheme: 'dark',
	previewStyles: 'auto',
};
export const normalizeUrl = (u: string) => u.trim().replace(/\/+$/, '');
