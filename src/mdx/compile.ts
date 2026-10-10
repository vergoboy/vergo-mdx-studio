import { evaluate } from '@mdx-js/mdx';
import remarkGfm from 'remark-gfm';
import { split } from './frontmatter';
import { runtime } from './runtime';
import { siteComponents } from './components';
import { checkPolicy } from './policy';

export interface CompileError { line: number; column: number; message: string; /** the offending line of the note */ excerpt?: string; /** plain-language fix suggestion */ hint?: string }

/** "attribute name" errors usually mean an earlier tag never got its closing `>`; find that tag. */
export function openTagHint(source: string, line: number, column: number): string | undefined {
	const lines = source.split('\n');
	const offset = lines.slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0) + column - 1;
	const before = source.slice(0, offset);
	const open = [...before.matchAll(/<([a-zA-Z][\w.:-]*)/g)].pop();
	if (!open || open.index === undefined) return undefined;
	const tail = before.slice(open.index);
	if (tail.includes('>')) return undefined;
	const openLine = before.slice(0, open.index).split('\n').length;
	if (openLine === line) return undefined;
	return `The tag <${open[1]}> opened on line ${openLine} never ends with ">", so the text after it is read as attributes. Add ">" after its last attribute (and a closing </${open[1]}> after its content).`;
}

/** MDX treats `<` and `{` as code. Most errors in ordinary prose come from one of those two. */
export function hintFor(message: string): string | undefined {
	if (/attribute name|before (?:name|attribute)|in (?:closing )?tag|closing (?:slash|tag)|end of the tag|Expected a closing tag|unexpected character `[^`]+` \(U\+/i.test(message) || /Unexpected (?:lazy|closing)/i.test(message)) {
		return 'MDX reads `<` as the start of a JSX tag. If this is plain text (a generic like Vec<u8>, a comparison, a URL in <angle brackets>, or HTML with unquoted attributes), wrap it in `backticks` or write \\< instead. Real HTML must be valid JSX: quote every attribute and close every tag.';
	}
	if (/expression|Could not parse|\{/i.test(message)) return 'MDX reads `{ … }` as a JavaScript expression. For literal braces write \\{ and \\}, or put the text in `backticks`.';
	return undefined;
}
export interface CompileResult {
	ok: boolean;
	html: string;
	headings: { depth: number; text: string; id: string }[];
	errors: CompileError[];
	warnings: string[];
	ms: number;
	/** Components used by the MDX that only exist on the website (shown as placeholders). */
	unknownComponents: string[];
}

const slug = (t: string) => t.normalize('NFC').toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-');

function placeholder(name: string) {
	return (props: Record<string, unknown>): Node => {
		const box = document.createElement('div');
		box.setAttribute('style', 'border:1px dashed #f08700;border-radius:8px;padding:10px 12px;margin:12px 0;font:12px ui-monospace,monospace;color:#f08700');
		box.textContent = `<${name} /> — not a site component (the site will refuse this page)`;
		const kids = props.children; if (kids instanceof Node) box.appendChild(kids);
		return box;
	};
}

/**
 * Compile MDX exactly like the site build does (same compiler, GFM on) and run it into DOM.
 * `import` lines are dropped for the preview only; the real build still resolves them.
 */
export async function compileMdx(source: string): Promise<CompileResult> {
	const t0 = performance.now();
	const { body, lines } = split(source);
	const rules = checkPolicy(source).map((e) => ({ line: e.line, column: e.column, message: e.message, excerpt: source.split('\n')[e.line - 1]?.slice(0, 200) }));
	const warnings: string[] = [];
	let code = body;
	// Imports are handled by the site (built-ins need none); the preview just drops them, keeping line numbers.
	code = code.replace(/^import\s[^\n]*$/gm, (m) => { if (!/@\/components\//.test(m)) warnings.push(`Preview ignores: ${m.trim().slice(0, 60)}`); return ''; });
	const names = [...new Set([...code.matchAll(/<([A-Z][\w]*)[\s/>]/g)].map((m) => m[1]))];
	const components: Record<string, unknown> = Object.fromEntries(names.map((n) => [n, siteComponents[n] ?? placeholder(n)]));
	try {
		const mod = await evaluate(code, { ...runtime, remarkPlugins: [remarkGfm], format: 'mdx' } as never);
		const Content = (mod as { default: (p: unknown) => Node }).default;
		const node = Content({ components });
		const holder = document.createElement('div');
		holder.appendChild(node);
		const headings: CompileResult['headings'] = [];
		holder.querySelectorAll('h1,h2,h3,h4').forEach((h) => {
			const text = h.textContent ?? ''; const id = slug(text); h.setAttribute('id', id);
			headings.push({ depth: Number(h.tagName[1]), text, id });
		});
		return { ok: true, html: holder.innerHTML, headings, errors: rules, warnings, ms: Math.round(performance.now() - t0), unknownComponents: names.filter((n) => !siteComponents[n]) };
	} catch (e) {
		const err = e as { line?: number; column?: number; reason?: string; message?: string; place?: { line?: number; column?: number; start?: { line: number; column: number } } };
		let line = err.line ?? err.place?.start?.line ?? err.place?.line ?? 1;
		let column = err.column ?? err.place?.start?.column ?? err.place?.column ?? 1;
		// MDX reports the exact spot of "unclosed tag" errors only inside the message, e.g. "(2:8-2:12)".
		const inMsg = /\((\d+):(\d+)(?:-\d+:\d+)?\)/.exec(String(err.reason ?? err.message ?? ''));
		if (inMsg) { line = Number(inMsg[1]); column = Number(inMsg[2]); }
		return {
			ok: false, html: '', headings: [], warnings, ms: Math.round(performance.now() - t0), unknownComponents: names,
			errors: [...rules, (() => {
				const message = String(err.reason ?? err.message ?? e).split('\n')[0];
				const abs = line + lines;
				return { line: abs, column, message, excerpt: source.split('\n')[abs - 1]?.slice(0, 200), hint: openTagHint(source, abs, column) ?? hintFor(message) };
			})()].sort((a, b) => a.line - b.line),
		};
	}
}
