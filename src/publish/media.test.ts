import { describe, it, expect } from 'vitest';
import { assetName, findLocalMedia, rewriteMedia } from './media';

describe('media', () => {
	it('finds local refs in markdown, html/jsx and frontmatter; ignores remote ones', () => {
		const text = '---\nimage: "cover.jpg"\n---\n![a](pics/a%20b.png) ![r](https://x.io/r.png) ![s](/og.png)\n<video src="clip.mp4" poster="p.webp"></video>\n<img src={"z.gif"} />\n[doc](notes.md)';
		expect(findLocalMedia(text).sort()).toEqual(['clip.mp4', 'cover.jpg', 'p.webp', 'pics/a b.png', 'z.gif']);
	});
	it('names assets by content hash and normalises the extension', async () => {
		const data = new TextEncoder().encode('hello').buffer as ArrayBuffer;
		expect(await assetName(data, 'Photo.JPEG')).toBe('2cf24dba5fb0a30e.jpg');
	});
	it('rewrites raw and encoded references, longest first', () => {
		const map = new Map([['pics/a b.png', '/media/studio/1.png'], ['a b.png', '/media/studio/2.png']]);
		expect(rewriteMedia('![x](pics/a%20b.png) ![y](a%20b.png)', map)).toBe('![x](/media/studio/1.png) ![y](/media/studio/2.png)');
	});
});
