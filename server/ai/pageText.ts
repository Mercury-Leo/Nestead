import { decodeEntities } from '../import';

/**
 * A fetched page as plain text for the model, in one linear pass and without a
 * DOM library. Defence in depth only: it drops what a reader never sees in the
 * markup (scripts, styles, elements hidden inline), but text hidden by a CSS
 * class needs the stylesheet and gets through, and nothing relies on this.
 *
 * Three steps, none of which looks back over the page: `tokenize` cuts it into
 * text, opening tags and closing tags; `pair` matches each opening tag with its
 * end; `toText` walks the tokens and skips the dropped elements. An element
 * with no end loses only its opening tag: guessing an end would risk the
 * page's visible text, where leaving it out leaks at worst a hidden scrap.
 */

export const MAX_PAGE_TEXT = 20_000;
const MAX_IMAGE_URL = 2_000;
/** The share of the page worth reading on its own: main or article with at least this much text. */
const REGION_MIN = 500;

const DROPPED = new Set(['head', 'script', 'style', 'noscript', 'template', 'svg', 'iframe']);
/** Elements whose content is not markup: it runs to the first closing tag of the same name. */
const RAW_TEXT = new Set(['script', 'style', 'noscript', 'template', 'iframe']);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const BLOCK = new Set([
  ...['p', 'div', 'section', 'article', 'main', 'header', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  ...['ul', 'ol', 'tr', 'td', 'th', 'table', 'tbody', 'caption', 'blockquote', 'pre', 'figure', 'figcaption'],
  ...['dl', 'dt', 'dd', 'nav', 'aside', 'br', 'hr', 'details', 'summary', 'form'],
]);
/** What ends a tag name. The empty string, past the end of the page, is in it too. */
const NAME_END = ' \t\n\r\f/>';

export interface PageText {
  text: string;
  image?: string;
}

interface OpenTag {
  kind: 'open';
  name: string;
  raw: string;
  /** Left out of the text, with everything up to its end. */
  dropped: boolean;
  selfClosing: boolean;
  /** Where the text carries on after the element: past its closing tag, or at the tag that cut it short. -1: nothing ends it. */
  end: number;
}
type Token = OpenTag | { kind: 'close'; name: string } | { kind: 'text'; text: string };

/** An attribute's value, quoted either way or bare: the first group that matched. */
const VALUE = /\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/;

function attrReader(name: string): (tag: string) => string | undefined {
  const pattern = new RegExp(`\\s${name}${VALUE.source}`, 'i');
  return (tag) => {
    const match = pattern.exec(tag);
    return match === null ? undefined : (match[1] ?? match[2] ?? match[3]);
  };
}

const ariaHidden = attrReader('aria-hidden');
const styleOf = attrReader('style');
const propertyOf = attrReader('property');
const nameOf = attrReader('name');
const contentOf = attrReader('content');

/** Most tags say nothing about being hidden: one cheap test spares them the attribute lookups. */
const HIDING = /hidden|display|visibility/i;

function isHidden(tag: string): boolean {
  if (!HIDING.test(tag)) return false;
  if (/\shidden(?:[\s=/>])/i.test(tag)) return true;
  if ((ariaHidden(tag) ?? '').toLowerCase() === 'true') return true;
  const style = (styleOf(tag) ?? '').toLowerCase().replace(/\s+/g, '');
  return style.includes('display:none') || style.includes('visibility:hidden');
}

const isLetter = (char: string): boolean => (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z');

/**
 * `indexOf(char, from)` with a memory: it asks again only once the answer lies
 * behind `from`. `from` never goes back, so all the calls together cost one scan
 * of the page, however many tags ask.
 */
function scanner(html: string, char: string): (from: number) => number {
  let found = -Infinity;
  return (from) => {
    if (found !== -1 && found < from) found = html.indexOf(char, from);
    return found;
  };
}

/** Where the first `</name` at or after `from` begins, or -1. `</scripty>` is another element. */
function closingTagAt(lower: string, name: string, from: number): number {
  for (let found = lower.indexOf(`</${name}`, from); found !== -1; found = lower.indexOf(`</${name}`, found + 1)) {
    if (NAME_END.includes(lower.charAt(found + 2 + name.length))) return found;
  }
  return -1;
}

/** The page cut into text, opening tags and closing tags. Comments and declarations leave no token. */
function tokenize(html: string): Token[] {
  // For the closing-tag search. Only A-Z change, so its indexes fit `html`; toLowerCase()
  // on the whole page would not ("İ" becomes two characters).
  const lower = html.replace(/[A-Z]+/g, (letters) => letters.toLowerCase());
  const nextLt = scanner(html, '<');
  const nextGt = scanner(html, '>');
  const tokens: Token[] = [];
  let textFrom = 0;
  let at = 0;

  /** The markup from `lt` up to `end`: the text before it becomes a token, then `made`, and the scan goes on after it. */
  const take = (lt: number, end: number, ...made: Token[]): void => {
    if (lt > textFrom) tokens.push({ kind: 'text', text: html.slice(textFrom, lt) });
    tokens.push(...made);
    textFrom = at = end;
  };

  // A '<' that `take` does not claim stays in the text.
  for (let lt = nextLt(0); lt !== -1; lt = nextLt(at)) {
    at = lt + 1;
    const next = html.charAt(at);
    if (next === '!') {
      if (html.startsWith('<!--', lt)) {
        const close = html.indexOf('-->', lt + 2);
        take(lt, close === -1 ? html.length : close + 3);
      } else if (nextGt(at) !== -1) {
        take(lt, nextGt(at) + 1);
      }
      continue;
    }

    const closing = next === '/';
    const nameFrom = closing ? at + 1 : at;
    if (!isLetter(html.charAt(nameFrom))) continue;
    // A tag ends at the next '>', unless another '<' comes first: then this one is text.
    const gt = nextGt(at);
    const another = nextLt(at);
    if (gt === -1 || (another !== -1 && another < gt)) continue;
    let nameTo = nameFrom;
    while (!NAME_END.includes(html.charAt(nameTo))) nameTo++;
    const name = lower.slice(nameFrom, nameTo);
    if (closing) {
      take(lt, gt + 1, { kind: 'close', name });
      continue;
    }

    const raw = html.slice(lt, gt + 1);
    const rawText = RAW_TEXT.has(name);
    const open: OpenTag = { kind: 'open', name, raw, dropped: DROPPED.has(name) || isHidden(raw), selfClosing: !rawText && raw.endsWith('/>'), end: -1 };
    if (!rawText) {
      take(lt, gt + 1, open);
      continue;
    }
    // Raw text: its content is skipped to the first closing tag, or to the end of the page when none comes.
    const close = closingTagAt(lower, name, gt + 1);
    if (close === -1) {
      take(lt, html.length, open);
    } else {
      const closeGt = nextGt(close);
      take(lt, closeGt === -1 ? html.length : closeGt + 1, open, { kind: 'close', name });
    }
  }
  if (html.length > textFrom) tokens.push({ kind: 'text', text: html.slice(textFrom) });
  return tokens;
}

/**
 * Gives each opening tag its end, in place. A closing tag ends the nearest open element of
 * its name; whatever was opened inside it and never closed gets no end. A `p` or `li` that
 * comes straight inside an open `p` or `li` ends it, and `body` ends an open `head`. Void and
 * self-closing tags are never open.
 */
function pair(tokens: Token[]): void {
  const open: OpenTag[] = [];
  const counts = new Map<string, number>();
  const pop = (): OpenTag => {
    const tag = open.pop() as OpenTag;
    counts.set(tag.name, (counts.get(tag.name) ?? 1) - 1);
    return tag;
  };
  /** Takes off the nearest open `name`, and whatever was opened inside it, and returns that element. */
  const popTo = (name: string): OpenTag => {
    let tag = pop();
    while (tag.name !== name) tag = pop();
    return tag;
  };

  tokens.forEach((token, i) => {
    if (token.kind === 'text') return;
    if (token.kind === 'close') {
      if (counts.get(token.name)) popTo(token.name).end = i + 1; // otherwise a stray closing tag
      return;
    }
    const top = open[open.length - 1];
    if (top !== undefined && top.name === token.name && (token.name === 'p' || token.name === 'li')) pop().end = i;
    else if (token.name === 'body' && counts.get('head')) popTo('head').end = i;
    if (VOID.has(token.name) || token.selfClosing) return;
    open.push(token);
    counts.set(token.name, (counts.get(token.name) ?? 0) + 1);
  });
}

/** Calls `each` on the tokens from `from` up to `to` that lie outside the dropped elements. */
function visible(tokens: Token[], from: number, to: number, each: (token: Token, index: number) => void): void {
  for (let i = from; i < to; ) {
    const token = tokens[i] as Token;
    if (token.kind === 'open' && token.dropped) {
      i = token.end === -1 ? i + 1 : token.end;
    } else {
      each(token, i);
      i++;
    }
  }
}

/** The visible text of the tokens from `from` up to `to`: blocks as lines, list items as dashes. */
function toText(tokens: Token[], from: number, to: number): string {
  let raw = '';
  visible(tokens, from, to, (token) => {
    if (token.kind === 'text') raw += token.text;
    else if (token.kind === 'open' && token.name === 'li') raw += '\n- ';
    else if (BLOCK.has(token.name)) raw += '\n';
  });
  return decodeEntities(raw)
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v\r\u00a0]+/g, ' ').trim())
    .filter((line) => line !== '' && line !== '-')
    .join('\n');
}

/** The part worth reading: the first visible main, or else article, if it holds enough text; otherwise the body. */
function readableText(tokens: Token[]): string {
  const first = new Map<string, number>();
  visible(tokens, 0, tokens.length, (token, i) => {
    if (token.kind === 'open' && !first.has(token.name)) first.set(token.name, i);
  });
  for (const name of ['main', 'article']) {
    const at = first.get(name);
    const end = at === undefined ? -1 : (tokens[at] as OpenTag).end;
    if (at === undefined || end === -1) continue;
    const text = toText(tokens, at + 1, end);
    if (text.length >= REGION_MIN) return text;
  }
  const body = first.get('body');
  return toText(tokens, body === undefined ? 0 : body + 1, tokens.length);
}

function metaImage(tokens: Token[], pageUrl: string): string | undefined {
  const metas = tokens.filter((token): token is OpenTag => token.kind === 'open' && token.name === 'meta');
  for (const wanted of ['og:image', 'twitter:image']) {
    for (const { raw } of metas) {
      if ((propertyOf(raw) ?? nameOf(raw) ?? '').toLowerCase() !== wanted) continue;
      const content = decodeEntities(contentOf(raw) ?? '').trim();
      if (!content) continue; // new URL('', page) would be the page itself
      try {
        const url = new URL(content, pageUrl);
        if ((url.protocol === 'https:' || url.protocol === 'http:') && url.href.length <= MAX_IMAGE_URL) return url.href;
      } catch {
        // Not a URL: try the next one.
      }
    }
  }
  return undefined;
}

export function pageText(html: string, pageUrl: string): PageText {
  const tokens = tokenize(html);
  pair(tokens);
  const image = metaImage(tokens, pageUrl);
  const text = readableText(tokens).slice(0, MAX_PAGE_TEXT);
  return image === undefined ? { text } : { text, image };
}
