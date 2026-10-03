import { decodeEntities } from '../import';

/**
 * A fetched page as plain text for the model, in one pass and without a DOM
 * library. Defence in depth only: it drops what a reader never sees in the
 * markup (scripts, styles, elements hidden inline), but text hidden by a CSS
 * class needs the stylesheet and gets through, and nothing relies on this.
 */

export const MAX_PAGE_TEXT = 20_000;
const MAX_IMAGE_URL = 2_000;
/** The share of the page worth reading on its own: main or article with at least this much text. */
const REGION_MIN = 500;

const DROPPED = new Set(['head', 'script', 'style', 'noscript', 'template', 'svg', 'iframe']);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const BLOCK = /<\/?(?:p|div|section|article|main|header|footer|h[1-6]|ul|ol|tr|table|blockquote|pre|figure|figcaption|dl|dt|dd|nav|aside|br)\b[^>]*>/gi;

export interface PageText {
  text: string;
  image?: string;
}

function attr(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return match === null ? undefined : (match[1] ?? match[2] ?? match[3]);
}

function isHidden(tag: string): boolean {
  if (/\shidden(?:[\s=/>])/i.test(tag)) return true;
  if ((attr(tag, 'aria-hidden') ?? '').toLowerCase() === 'true') return true;
  const style = (attr(tag, 'style') ?? '').toLowerCase().replace(/\s+/g, '');
  return style.includes('display:none') || style.includes('visibility:hidden');
}

/** Where the element `name`, opened just before `from`, ends: past its matching close tag, or the end of the text. */
function closingEnd(html: string, name: string, from: number): number {
  const tags = new RegExp(`<(/?)${name}\\b[^>]*>`, 'gi');
  tags.lastIndex = from;
  let depth = 1;
  for (let match = tags.exec(html); match !== null; match = tags.exec(html)) {
    depth += match[1] === '/' ? -1 : 1;
    if (depth === 0) return tags.lastIndex;
  }
  return html.length;
}

/** The html without every element whose opening tag `drop` picks, contents and all. */
function removeElements(html: string, drop: (name: string, tag: string) => boolean): string {
  const open = /<([a-z][a-z0-9-]*)\b[^>]*>/gi;
  let out = '';
  let at = 0;
  for (let match = open.exec(html); match !== null; match = open.exec(html)) {
    const name = (match[1] as string).toLowerCase();
    const tag = match[0];
    if (VOID.has(name) || tag.endsWith('/>') || !drop(name, tag)) continue;
    const end = closingEnd(html, name, open.lastIndex);
    out += html.slice(at, match.index);
    at = end;
    open.lastIndex = end;
  }
  return out + html.slice(at);
}

function toText(html: string): string {
  return decodeEntities(html.replace(/<li\b[^>]*>/gi, '\n- ').replace(BLOCK, '\n').replace(/<[^>]*>/g, ''))
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v\r ]+/g, ' ').trim())
    .filter((line) => line !== '' && line !== '-')
    .join('\n');
}

function region(html: string): string {
  for (const name of ['main', 'article']) {
    const start = new RegExp(`<${name}\\b[^>]*>`, 'i').exec(html);
    if (start === null) continue;
    const from = start.index + start[0].length;
    const inner = html.slice(from, closingEnd(html, name, from));
    if (toText(inner).length >= REGION_MIN) return inner;
  }
  const body = /<body\b[^>]*>/i.exec(html);
  return body === null ? html : html.slice(body.index + body[0].length);
}

function metaImage(html: string, pageUrl: string): string | undefined {
  const metas = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const wanted of ['og:image', 'twitter:image']) {
    for (const tag of metas) {
      if ((attr(tag, 'property') ?? attr(tag, 'name') ?? '').toLowerCase() !== wanted) continue;
      try {
        const url = new URL(decodeEntities(attr(tag, 'content') ?? '').trim(), pageUrl);
        if ((url.protocol === 'https:' || url.protocol === 'http:') && url.href.length <= MAX_IMAGE_URL) return url.href;
      } catch {
        // Not a URL: try the next one.
      }
    }
  }
  return undefined;
}

export function pageText(html: string, pageUrl: string): PageText {
  const image = metaImage(html, pageUrl);
  const visible = removeElements(html.replace(/<!--[\s\S]*?-->/g, ''), (name, tag) => DROPPED.has(name) || isHidden(tag));
  const text = toText(region(visible)).slice(0, MAX_PAGE_TEXT);
  return image === undefined ? { text } : { text, image };
}
