/** Tiny JSX runtime that builds real DOM nodes, so MDX can be previewed without React. */

type Props = Record<string, unknown> & { children?: unknown };
type Component = (props: Props) => Node;

export const Fragment = Symbol('Fragment');
const VOID = new Set(['img', 'br', 'hr', 'input', 'source', 'track', 'meta', 'link', 'col', 'area', 'embed', 'wbr']);
const ATTR: Record<string, string> = { className: 'class', htmlFor: 'for', tabIndex: 'tabindex', autoPlay: 'autoplay', playsInline: 'playsinline', srcSet: 'srcset', crossOrigin: 'crossorigin', colSpan: 'colspan', rowSpan: 'rowspan' };

export function append(parent: Node, child: unknown): void {
	if (child === null || child === undefined || typeof child === 'boolean') return;
	if (Array.isArray(child)) { child.forEach((c) => append(parent, c)); return; }
	if (child instanceof Node) { parent.appendChild(child); return; }
	parent.appendChild(document.createTextNode(String(child)));
}

export function jsx(type: string | symbol | Component, props: Props | null): Node {
	const p = props ?? {};
	if (type === Fragment) { const f = document.createDocumentFragment(); append(f, p.children); return f; }
	if (typeof type === 'function') return type(p);
	const el = document.createElement(String(type));
	for (const [k, v] of Object.entries(p)) {
		if (k === 'children' || v === undefined || v === null || v === false) continue;
		if (k === 'dangerouslySetInnerHTML') { el.innerHTML = String((v as { __html: string }).__html); continue; }
		if (k.startsWith('on') && typeof v === 'function') continue; // no event handlers in previews
		if (k === 'style' && typeof v === 'object') {
			el.setAttribute('style', Object.entries(v as Record<string, string | number>).map(([a, b]) => `${a.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${b}`).join(';'));
			continue;
		}
		el.setAttribute(ATTR[k] ?? k, v === true ? '' : String(v));
	}
	if (!VOID.has(String(type))) append(el, p.children);
	return el;
}
export const jsxs = jsx;
export const runtime = { Fragment, jsx, jsxs } as unknown as { Fragment: unknown; jsx: unknown; jsxs: unknown };
