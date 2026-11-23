// The chat's word check (session 55c): every message, with a tip or without, mods' too, is checked here before anyone
// sees it, and before anything is paid. Caught: it isn't sent ("Not sent: that word isn't welcome in this chat.").
// Three lists: the NutPub's own (slurs and hate, not everyday swearing: it's a pub), the words the artist adds in
// Cellar, and the words on the artist's Nostr mute list (NIP-51, chat.js). Whole words only, so a word inside another
// word isn't caught; spellings like s.l.u.r, s l u r, 5lur, sluuut and Cyrillic look-alikes are.
// The NutPub's list is kept in ROT13, so a reader of the code isn't met by a page of slurs. An entry ending in * also
// catches longer words that start with it; a - joins the words of a phrase.
import { kv } from './db.js';
import { json } from './http.js';

const rot13 = (s) => s.replace(/[a-z]/g, (ch) => String.fromCharCode(((ch.charCodeAt(0) - 84) % 26) + 97));
const NUTPUB = rot13('avttre* avttn* avttnu* fnaqavttre* pbba pbbaf puvax* tbbx* fcvp fcvpf jrgonpx* xvxr* cnxv cnxvf enturnq* gbjryurnq* jbt jbtf tbyyvjbt* wvtnobb* cbepuzbaxrl* ornare* tlccb* tlcb cvxrl* mvccreurnq* xnssve* qnexvr* qnexl puvaxl lvq lvqf '
  + 'snttbg* sntbg* qlxr qlxrf genaal* genaavr* furznyr* cbbsgre* onggl-obl ergneq ergneqf ergneqrq ergneqb fcnm fcnmm* fcnfgvp* zbat zbatf zbatbybvq* '
  + 'phag* juber* fyhg fyhgf fyhggl fxnax* encr encrq encvat encvfg* xlf xvyy-lbhefrys xvyy-hefrys xvyy-lnfrys arpx-lbhefrys unat-lbhefrys tb-qvr urvy-uvgyre fvrt-urvy').split(' ');

// Look-alikes: numbers and symbols for letters, and Cyrillic letters that look Latin.
const LIKE = { 0: 'o', 1: 'i', '!': 'i', '|': 'i', 3: 'e', 4: 'a', '@': 'a', 5: 's', $: 's', 7: 't', 8: 'b', 9: 'g', '+': 't',
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'i', ѕ: 's', к: 'k', м: 'm', т: 't', н: 'h', в: 'b' };
// A message as plain lower-case words, one space apart; three or more single letters in a row become one word.
export function plain(text) {
  const like = (s) => [...s].map((ch) => LIKE[ch] ?? ch).join('');
  // A number or symbol counts as a letter only before a letter (5lut, n1gg3r), so "100 sats" and "wow!!" stay as they are.
  const t = like(String(text || '').normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase()
    .replace(/[0-9!|@$+]+(?=\p{L})/gu, like).replace(/[0-9!|@$+]+/g, ' ')).replace(/[^\p{L}]+/gu, ' ').trim();
  const out = [];
  let run = [];
  const flush = () => { if (run.length >= 3) out.push(run.join('')); else out.push(...run); run = []; };
  for (const w of t.split(' ').filter(Boolean)) { if (w.length === 1) run.push(w); else { flush(); out.push(w); } }
  flush();
  return out.join(' ');
}
const esc = (ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// One entry as a pattern: each letter may be typed more than once (sluuut); a stem (*) takes any ending, a word a plural.
function pattern(entry) {
  const stem = entry.endsWith('*');
  const words = plain(entry.replace(/\*$/, '').replace(/-/g, ' ')).split(' ').filter(Boolean);
  if (!words.length) return null;
  const word = (w) => w.match(/(.)\1*/gu).map((run) => `${esc(run[0])}{${run.length},}`).join('');
  return `${words.map(word).join(' ')}${stem ? '\\p{L}*' : '(?:e?s|z)?'}`;
}
const compile = (list) => {
  const parts = list.map(pattern).filter(Boolean);
  return parts.length ? new RegExp(`(?:^| )(?:${parts.join('|')})(?= |$)`, 'u') : null;
};
const OURS = compile(NUTPUB);
const cache = new Map();
// Is this text caught by the NutPub's list, or by `extra` (the artist's words, their Nostr muted words)?
export function caught(text, extra = []) {
  const t = plain(text);
  if (!t) return false;
  if (OURS.test(t)) return true;
  if (!extra.length) return false;
  const key = extra.join('\n');
  if (!cache.has(key)) { if (cache.size > 20) cache.clear(); cache.set(key, compile(extra.map((w) => String(w).replace(/\*/g, '')))); }
  return !!cache.get(key)?.test(t);
}
// The artist's own words (Cellar) and their Nostr mute list's words, for this stage.
export const extraWords = async () => [...(await kv.get('chatWords', [])), ...((await kv.get('muteList', null))?.words || [])];
export const NOT_WELCOME = 'Not sent: that word isn’t welcome in this chat.';
// For a route: before a message goes out (or is paid for), with a tip or without.
export const noBadWords = (text) => async (c) => (caught(await text(c), await extraWords())
  ? json({ error: 'not_welcome', detail: NOT_WELCOME }, 400) : null);
// The artist's own words, as typed in Cellar: one per line or comma, 40 characters each, 100 at most.
export const tidyWords = (input) => [...new Set(String(input || '').split(/[\n,;]+/).map((w) => w.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().toLowerCase().slice(0, 40)).filter((w) => plain(w)))].slice(0, 100);
