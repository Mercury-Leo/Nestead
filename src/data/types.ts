import type {
  AiStatus,
  Base,
  BoardColumn,
  DietProfile,
  ListGroup,
  ListItem,
  Member,
  NewRow,
  PantryItem,
  Recipe,
  Task,
} from '../domain/types';

/** Called whenever the collection's rows may have changed. */
export type ChangeListener = () => void;

/** Cancels a subscription. */
export type Unsubscribe = () => void;

/**
 * One family-scoped table. Every backend implements this identically and must
 * pass runDataStoreContract() in collection.contract.ts.
 */
export interface Collection<T extends Base> {
  list(): Promise<T[]>;
  create(row: NewRow<T>): Promise<T>;
  update(id: string, patch: Partial<NewRow<T>>): Promise<T>;
  remove(id: string): Promise<void>;
  /**
   * Fire onChange after any change to this collection, including changes made
   * by another tab or another client. Returns an unsubscribe function.
   */
  subscribe(onChange: ChangeListener): Unsubscribe;
}

/**
 * Recipe photos. Blobs are not rows: they live beside the tables (IndexedDB
 * locally, a private Storage bucket on Supabase) and a recipe keeps the id.
 */
export interface PhotoStore {
  /** Stores a JPEG and returns its id. */
  put(blob: Blob): Promise<string>;
  /** A URL an <img> can load, or null if the photo is gone. */
  url(id: string): Promise<string | null>;
  remove(id: string): Promise<void>;
}

/** Every collection one family owns. */
export interface DataStore {
  familyId: string;
  members: Collection<Member>;
  columns: Collection<BoardColumn>;
  tasks: Collection<Task>;
  recipes: Collection<Recipe>;
  pantry: Collection<PantryItem>;
  /** At most one row per family. */
  dietProfiles: Collection<DietProfile>;
  listItems: Collection<ListItem>;
  /** The family's own shopping-list groups. */
  listGroups: Collection<ListGroup>;
  photos: PhotoStore;
}

/** The family a signed-in person belongs to. */
export interface Family {
  id: string;
  name: string;
  /** Share this so somebody can join. Rotatable, see Account.rotateJoinCode. */
  joinCode: string;
}

/** What sign-up led to. */
export type SignUpResult = 'signedIn' | 'confirmEmail';

/**
 * Accounts and families: everything a backend with real sign-in owes the app
 * besides the DataStore. AccountSession (src/auth/accountSession.tsx) and the
 * sign-in screens talk only to this, so swapping the backend means writing one
 * of these and one DataStore, then naming them in src/auth/session.tsx.
 *
 * Every method that fails throws an Error whose message the screens show as is.
 *
 * What the backend must enforce, not the client:
 *   * a member row's id is the signed-in user's id;
 *   * a person belongs to one family at most;
 *   * a family's rows, and the family itself, are visible only to its members,
 *     so a stale guess at a family id reads nothing and writes nothing;
 *   * at most one diet profile per family (src/features/larder/setup.ts relies
 *     on the second insert failing).
 */
export interface Account {
  /**
   * Calls back with the signed-in user's id, or null, now and after every
   * change. `recovery` is true when the change came from a password-reset link.
   * Repeat calls for the same user are allowed (token refresh, say).
   */
  watchUser(onChange: (userId: string | null, recovery: boolean) => void): Unsubscribe;
  /** True once, if the page was opened from a password-reset link. Read before watchUser. */
  takeRecoveryLink(): boolean;
  /** Why an email link failed (usually that it expired), once. */
  takeLinkError(): string | null;

  /** Whether the next sign-in is remembered past closing the browser. */
  rememberMe(): boolean;
  signIn(email: string, password: string, remember: boolean): Promise<void>;
  /** `confirmTo` is where the confirmation email's link should land, if it matters. */
  signUp(email: string, password: string, remember: boolean, confirmTo?: string): Promise<SignUpResult>;
  /** Emails a reset link that comes back to `returnTo`. Succeeds whether or not the account exists. */
  sendPasswordReset(email: string, returnTo: string): Promise<void>;
  /** For the signed-in user, after a recovery link. */
  setPassword(password: string): Promise<void>;
  signOut(): Promise<void>;

  /** The family this user belongs to, or null if they have not joined one. */
  readMembership(userId: string): Promise<Family | null>;
  readFamily(familyId: string): Promise<Family>;
  /** Makes a family with the signed-in user as its first member. */
  createFamily(familyName: string, displayName: string): Promise<void>;
  /** Adds the signed-in user to the family with this join code. */
  joinFamily(code: string, displayName: string): Promise<void>;
  /** Replaces the user's family's join code and returns the new one. */
  rotateJoinCode(): Promise<string>;
  /** The name of the family behind a join code, null if none; answers signed out too. */
  inviteFamilyName(code: string): Promise<string | null>;

  // AI reading. The backend must ensure that only members of a family read or
  // change its AI settings; that no call returns the plaintext OpenRouter key,
  // and the encrypted key only through the server's claim, for the caller's own
  // family; that free reads are counted atomically per user per UTC day and for
  // the whole app; and that the plaintext key is never stored.

  /** The signed-in user's access token, for Nestead's own /api/ai routes; null when signed out. */
  accessToken(): Promise<string | null>;
  /** The family's AI settings as any member may see them. */
  aiStatus(): Promise<AiStatus>;
  clearAiKey(): Promise<void>;
  /** Null goes back to the free models. */
  setAiModel(model: string | null): Promise<void>;

  /** The family's rows, uncached: the caller wraps it in withCache(). */
  openStore(familyId: string): DataStore;
}
