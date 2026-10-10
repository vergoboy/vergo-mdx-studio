import { normalizeUrl, type StudioSettings } from '../settings';

export interface HttpRequest { url: string; method: string; headers: Record<string, string>; body?: string | ArrayBuffer }
export interface HttpResponse { status: number; json?: unknown; text?: string }
export type HttpFn = (req: HttpRequest) => Promise<HttpResponse>;

export class StudioError extends Error {
	constructor(message: string, public status = 0, public errors: { path?: string; line?: number; message: string }[] = []) { super(message); }
}

export interface Submission {
	collection: 'journal' | 'projects'; lang: 'en' | 'fa'; slug: string; ext: 'mdx' | 'md';
	content: string; media: string[]; vaultPath: string;
}

export class StudioClient {
	constructor(private s: Pick<StudioSettings, 'siteUrl' | 'token'>, private http: HttpFn) {}

	private async call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
		const isBin = body instanceof ArrayBuffer;
		const res = await this.http({
			url: `${normalizeUrl(this.s.siteUrl)}${path}`, method,
			headers: { authorization: `Bearer ${this.s.token}`, ...(body !== undefined ? { 'content-type': isBin ? 'application/octet-stream' : 'application/json' } : {}), ...extra },
			body: body === undefined ? undefined : isBin ? (body as ArrayBuffer) : JSON.stringify(body),
		});
		const j = (res.json ?? {}) as { error?: string; errors?: StudioError['errors']; missing?: string[] };
		if (res.status === 401) throw new StudioError('The server rejected the token. Create a new one in the dashboard (Settings ▸ Studio tokens).', 401);
		if (res.status >= 400) throw new StudioError(j.error ?? `HTTP ${res.status}`, res.status, j.errors ?? []);
		return res.json as Record<string, unknown>;
	}

	ping() { return this.call('GET', '/api/studio/ping') as Promise<{ ok: boolean; token: string; mdxValidation: boolean; maxMediaMb: number }>; }
	async missingMedia(names: string[]) { return ((await this.call('POST', '/api/studio/media/check', { names })).missing as string[]) ?? []; }
	uploadMedia(name: string, data: ArrayBuffer) { return this.call('PUT', `/api/studio/media?name=${encodeURIComponent(name)}`, data); }
	submit(s: Submission) { return this.call('POST', '/api/studio/submissions', s) as Promise<{ id: string; key: string; status: string }>; }
}
