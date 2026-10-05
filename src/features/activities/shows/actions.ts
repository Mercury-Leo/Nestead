import type { DataStore } from '../../../data/types';
import { lacksGenres, newShow, nextStatus, refreshPatch, statusPatch } from '../../../domain/shows';
import type { FetchedDetails } from '../../../domain/shows';
import type { Show } from '../../../domain/types';
import { lookupShow } from './client';
import type { ShowsFailure } from './client';

/**
 * The Shows page's writes. Screens decide what to do; these do it through the
 * store, as ../../larder/actions.ts does for the kitchen.
 */

/**
 * Adds a show to the family's list, or finds the one already there: the same
 * title is never added twice. If another device added it a moment ago, the
 * backend turns the insert away (one row per title) and its row is returned.
 */
export async function addShow(store: DataStore, shows: readonly Show[], details: FetchedDetails, memberId: string): Promise<{ show: Show; existed: boolean }> {
  const existing = shows.find((row) => row.imdbId === details.imdbId);
  if (existing !== undefined) return { show: existing, existed: true };
  try {
    return { show: await store.shows.create(newShow(details, new Date().toISOString(), memberId)), existed: false };
  } catch (error) {
    const raced = (await store.shows.list()).find((row) => row.imdbId === details.imdbId);
    if (raced === undefined) throw error;
    return { show: raced, existed: true };
  }
}

/** To watch, Watching, Watched, and round again; watchedAt follows. A dropped show comes back as To watch. */
export async function cycleStatus(store: DataStore, show: Show): Promise<Show> {
  return store.shows.update(show.id, statusPatch(nextStatus(show.status), new Date().toISOString()));
}

/** The family decided not to watch it. It leaves All for the Dropped filter. */
export async function dropShow(store: DataStore, show: Show): Promise<Show> {
  return store.shows.update(show.id, statusPatch('dropped', new Date().toISOString()));
}

/** A dropped show back on the list, as To watch (Restore, or a press on its badge). */
export async function restoreShow(store: DataStore, show: Show): Promise<Show> {
  return store.shows.update(show.id, statusPatch('to-watch', new Date().toISOString()));
}

/** Stars or unstars a show for the whole family. Unstarring writes false, never a cleared field: the backend's column is not null. */
export async function toggleFavorite(store: DataStore, show: Show): Promise<Show> {
  return store.shows.update(show.id, { favorite: show.favorite !== true });
}

/**
 * Reads this one show's details again and saves only the fetched fields. On any
 * failure nothing is written and the saved details stay as they were.
 */
export async function refreshShow(store: DataStore, show: Show, lookup: typeof lookupShow = lookupShow): Promise<{ ok: true; show: Show } | { ok: false; failure: ShowsFailure }> {
  const answer = await lookup(show.imdbId, true);
  if (!answer.ok) return answer;
  if (answer.value.imdbId !== show.imdbId) return { ok: false, failure: 'failed' };
  return { ok: true, show: await store.shows.update(show.id, refreshPatch(answer.value, new Date().toISOString())) };
}

/** Lookups in flight at once while filling in genres. */
const FILL_AT_ONCE = 3;

/**
 * Reads again, once each, the shows added before genres were saved, and saves
 * what comes back as a refresh would (refreshPatch(), genres among the rest):
 * one lookup per show, a few at a time. It stops early when the rest would
 * fail too (the day's lookups used up, or none on this server) and returns
 * that failure; a show that fails on its own is skipped and stays offered. A
 * title the service no longer has saves an empty list, so it is not offered
 * again. `onProgress` hears how many shows are done, failed ones included.
 */
export async function fillGenres(
  store: DataStore,
  shows: readonly Show[],
  onProgress: (done: number) => void = () => undefined,
  lookup: typeof lookupShow = lookupShow,
): Promise<{ done: number; failure?: ShowsFailure }> {
  const queue = shows.filter(lacksGenres);
  let done = 0;
  let stopped: ShowsFailure | undefined;
  let skipped: ShowsFailure | undefined;

  async function fill(show: Show): Promise<void> {
    const answer = await lookup(show.imdbId, true);
    if (!answer.ok && (answer.failure === 'limit' || answer.failure === 'unavailable')) {
      stopped ??= answer.failure;
      return;
    }
    try {
      if (answer.ok && answer.value.imdbId === show.imdbId) await store.shows.update(show.id, refreshPatch(answer.value, new Date().toISOString()));
      else if (!answer.ok && answer.failure === 'not-found') await store.shows.update(show.id, { genres: [] });
      else skipped = 'failed';
    } catch {
      skipped = 'failed';
    }
    done += 1;
    onProgress(done);
  }

  const worker = async (): Promise<void> => {
    for (let show = queue.shift(); show !== undefined && stopped === undefined; show = queue.shift()) await fill(show);
  };
  await Promise.all(Array.from({ length: FILL_AT_ONCE }, worker));
  const failure = stopped ?? skipped;
  return failure === undefined ? { done } : { done, failure };
}

export async function removeShow(store: DataStore, id: string): Promise<void> {
  await store.shows.remove(id);
}
