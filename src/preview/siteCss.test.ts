import { describe, it, expect } from 'vitest';
import { loadSiteCss } from './siteCss';
import type { HttpFn } from '../publish/client';

const page = (css: string) => `<html><head><link rel="stylesheet" href="/_astro/a.css"><style>.inline{}</style></head></html>`;
const mk = (css: string, status = 200): HttpFn => async (r) => (r.url.endsWith('/en/') ? { status, text: page(css) } : { status, text: css });

describe('loadSiteCss', () => {
	it('uses the live stylesheet only when it is the current design', async () => {
		const live = await loadSiteCss('https://a.test', 'en', mk('.prose-body{} .wrap{} @font-face{src:url(/f.woff2)} .x{background:url(i.png)}'), 'BUNDLED');
		expect(live.source).toBe('live');
		expect(live.inline).toContain('url(https://a.test/_astro/i.png)');
	});
	it('falls back to the bundled snapshot for an old site, errors and offline', async () => {
		expect((await loadSiteCss('https://b.test', 'en', mk('.old{}'), 'BUNDLED')).inline).toBe('BUNDLED');
		expect((await loadSiteCss('https://c.test', 'en', mk('', 500), 'BUNDLED')).source).toBe('bundled');
		const down: HttpFn = async () => { throw new Error('offline'); };
		expect((await loadSiteCss('https://d.test', 'en', down, 'BUNDLED')).source).toBe('bundled');
	});
	it('bundled mode never touches the network', async () => {
		const never: HttpFn = async () => { throw new Error('should not be called'); };
		expect((await loadSiteCss('https://e.test', 'en', never, 'BUNDLED', 'bundled')).inline).toBe('BUNDLED');
	});
});
