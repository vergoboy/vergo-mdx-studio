/** Same rules as the server (admin/lib/policy.mjs) so problems show up in the editor first. */
export const BUILTIN_COMPONENTS = ['Callout', 'Card', 'Tabs', 'Tab', 'YouTube', 'AudioPlayer', 'VideoPlayer'] as const;

const blank = (m: string) => m.replace(/[^\n]/g, ' ');
const maskCode = (t: string) => t.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, blank).replace(/`[^`\n]*`/g, blank);

export interface PolicyError { line: number; column: number; message: string }

export function checkPolicy(source: string): PolicyError[] {
	const fm = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(source);
	const offset = fm ? fm[0].split('\n').length - 1 : 0;
	const body = maskCode(fm ? source.slice(fm[0].length) : source);
	const errors: PolicyError[] = [];
	const at = (index: number, message: string) => {
		const before = body.slice(0, index);
		errors.push({ line: before.split('\n').length + offset, column: index - before.lastIndexOf('\n'), message });
	};
	for (const m of body.matchAll(/^import\s+(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/gm)) {
		if (!m[1].startsWith('@/components/')) at(m.index ?? 0, `Imports are not allowed: "${m[1]}". Only the built-in components (${BUILTIN_COMPONENTS.join(', ')}) can be used, and they need no import.`);
	}
	for (const m of body.matchAll(/^export\s+(?:const|let|var|function|class|async|default|\{|\*)/gm)) at(m.index ?? 0, '`export` is not allowed in site pages.');
	for (const m of body.matchAll(/<([A-Z]\w*)(?:\.[\w.]+)?(?=[\s/>])/g)) {
		if (!(BUILTIN_COMPONENTS as readonly string[]).includes(m[1])) at(m.index ?? 0, `Unknown component <${m[1]}>. Available: ${BUILTIN_COMPONENTS.map((c) => `<${c}>`).join(' ')}.`);
	}
	for (const m of body.matchAll(/\{[^}\n]*\b(?:process|require|globalThis|eval|fetch|Deno|Bun)\b[^}\n]*\}|\{[^}\n]*\bimport\s*\(/g)) at(m.index ?? 0, 'This expression uses a server-side API (process / require / import() / fetch …), which is not allowed.');
	return errors.sort((a, b) => a.line - b.line || a.column - b.column);
}
