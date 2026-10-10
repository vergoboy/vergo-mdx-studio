// Minimal stand-ins so pure modules can be imported in tests.
export class Plugin {}
export class ItemView {}
export class Modal {}
export class Notice { constructor(public msg?: string) {} setMessage() {} hide() {} }
export class PluginSettingTab {}
export class Setting {}
export class TFile {}
export class TFolder {}
export const requestUrl = async () => ({ status: 200, json: {}, text: '' });
