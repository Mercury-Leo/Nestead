# board
The kanban board and home page: the family's columns and task cards, with drag and drop, filters, the tick that marks a task done, repeating chores, and the History page.

## Files
| File | Responsibility |
| --- | --- |
| `BoardPage.tsx` | The page: the family's name as subtitle, who you are ("I am" picker in demo mode), Family link, sign out, a one-line invite while alone. After History's Restore it shows a note, once, and outlines the restored card. The board paints before its rows arrive, but `LoadFailed` takes its place while the columns' or tasks' first read fails. |
| `BoardPage.test.tsx` | The restore note: shown once, the card outlined, the history entry's state dropped; nothing without it. |
| `Board.tsx` | Filter bar, ordered columns, drop handling, reviving due repeats and clearing old done tasks when it loads, the drag ghost portal. |
| `Board.test.tsx` | The tick, the Done fold, Clear and the drag targets, against the local store. |
| `Column.tsx` | Rename, move, delete (only when empty) and fold a column; its open cards and composer, then its Done fold with Clear. |
| `TaskCard.tsx` | A card: the tick on its emoji; expanded: description, due date, repeat, icon, assignee, delete. |
| `TaskComposer.tsx` | Adds a task; the arrow opens description, due date, repeat and assignee. |
| `DueDateInput.tsx` | A date field that reports only whole dates. |
| `useTaskDrag.ts` | Pointer-event dragging of cards: ghost, target column, insertion line, edge scrolling. |
| `dragDrop.ts` (+ `dragDrop.test.ts`) | `dropPosition()` and `insertionBefore()`: where a dropped card lands, without the DOM. |
| `filter.ts` (+ `filter.test.ts`) | `TaskFilter`, `matchesFilter()`, `parseFilter()`, `withKnownAssignee()`. |
| `recurrence.ts` (+ `recurrence.test.ts`) | `REPEAT_OPTIONS`, `nextOccurrence()`, `doneAtOf()`, `returnDate()`, `isDueAgain()`, `isOverdue()`, local-date helpers. |
| `actions.ts` (+ `actions.test.ts`) | Store writes: `completeTask()`, `reopenTask()`, `clearDone()`, `autoClear()`, `reviveRecurring()`, `restoreTask()`, `placeTask()`, `moveColumn()`, `endPosition()`. |
| `defaultColumns.ts` | `seedDefaultColumns()`: one "To do" column for a family with none. |
| `history/HistoryPage.tsx` (+ `HistoryPage.module.css`, `HistoryPage.test.tsx`) | The History page at `/history`: every tick by day with who did it, a "Done by" filter (the kit's `SelectButton`), and Restore. |
| `history/groupByDay.ts` (+ `groupByDay.test.ts`) | `groupByDay()`: entries newest first in runs of one local day, today and yesterday named. |
| `icons.ts` | `TASK_ICONS` (emoji) and `DEFAULT_TASK_ICON`. |
| `board.css` | Global class names for the whole board, imported in `../../main.tsx`. |

## How it works
- A drop runs `dropPosition()` over every task in the column, hidden and done ones included (`Board.tsx`), then `placeTask()`, which moves the card and nothing else (`actions.ts`).
- The tick, on the card's emoji, calls `completeTask()`: it writes a history entry (a copy of the task and who ticked it), then `done`, `doneAt` and `completionId` on the task. Unticking (`reopenTask()`) clears them and removes that entry. Neither touches `dueDate` (`TaskCard.tsx`, `actions.ts`).
- A tick or untick on its way ignores further presses on that card (a ref guards it, the tick shows `aria-busy`): the card changes only once the entry is written, so on a slow backend a second press would tick again and leave an entry nothing points at. A failed one leaves the card as it was, ready to try again (`TaskCard.tsx`).
- Done cards fold under their own column as "Done (n)", newest first, closed whenever the board loads. Clear in the fold deletes its done one-offs after a confirm, and keeps their history (`Column.tsx`, `clearDone()`). Side by side, an open fold's list stops at 40vh and scrolls, so a long one cannot take the column's height from the open cards; stacked on a phone the page scrolls instead and there is no cap (`board.css`).
- When the board loads it runs `reviveRecurring()` and `autoClear()`; there is no server job. A done repeat whose `returnDate()` has arrived is unticked in place, in its own column, due on its next round. A done one-off ticked more than `CLEAR_AFTER_DAYS` (7) days ago is deleted. Repeats are never cleared. Both run to the end even when one fails, before another pass may start; a failure is only a console warning, and the next open tries again (`Board.tsx`, `actions.ts`).
- History lists the whole `taskCompletions` collection, newest first, by local day. Restore (`restoreTask()`) unticks a task still on the board, or creates a cleared one again from its entry at the end of its column (the first column if that is gone) and points every entry of the old task at the new one, so a second press cannot duplicate it. The entry stays: restore means "do it again". It then goes to the board with `location.state.restored`, which `BoardPage.tsx` reads once for its note ("back in ...") and the outline on the card (`history/HistoryPage.tsx`).
- The filter is saved per family on this device as the preference `boardFilter` (`Board.tsx`).
- Below 768px (`useIsNarrow()`) columns stack and can be folded; all start open, since done tasks fold inside their column instead (`Board.tsx`). A mouse drags after 5px, a finger after a 350ms press (`useTaskDrag.ts`).
- A drag re-renders the board on every pointer move, but not the cards: `TaskCard` is memoised, the drag context holds only the stable `startDrag`, and the card being dragged learns it from its `dragging` prop (`Board.tsx`, `TaskCard.tsx`).
- Design background: [ARCHITECTURE.md](../../../docs/ARCHITECTURE.md#the-board).

## Connections
- Uses: `../../auth/session.tsx`, `../../data/useCollection.ts`, `../../data/local/localStore.ts`, `../../domain/position.ts`, `../../hooks/`, `../../components/`, `../../i18n/`.
- Used by: `../../app/AppRoutes.tsx` (the board, and `history/HistoryPage.tsx` as a lazy chunk), `../../auth/demoSession.tsx` and `../../auth/openFamily.ts` (`seedDefaultColumns`), `../../main.tsx` (`board.css`), `../lists/useSectionDrag.ts` (`insertionBefore`).

## Rules & gotchas
- `Task.done` belongs to the card: only `completeTask()`, `reopenTask()`, `reviveRecurring()` and `restoreTask()` write it. A done repeat keeps the due date it covered; its return date is `returnDate()`.
- Done cards have no `data-task-id`, so they are never drop targets, and they cannot be dragged: untick first (`TaskCard.tsx`). `dropPosition()` still counts them, so an unticked card goes back to its old place.
- The board never reads `taskCompletions`; only History lists it, so the board does not slow down as history grows. The tick and the untick reach it by id, and an entry's `taskId` has no foreign key on purpose (`../../../supabase/README.md`).
- History also reads the board's `tasks` and `columns` and waits for all three (`LoadFailed` if any first read fails): Restore decides from them, and with `tasks` unread it would create a task that is already on the board. For the same reason a Restore in progress ignores further presses on that task (a ref guards it, the button shows disabled), since until it finishes the task is still missing from the board; a failed one re-enables the button (`history/HistoryPage.tsx`).
- Only an untick removes a history entry; Clear, auto-clear and deleting a task leave it. `doneAtOf()` falls back to `updatedAt` for a task ticked before `doneAt` existed.
- `recurFrom` stays apart from `dueDate` so a chore on the 31st returns to the 31st; setting a new due date resets it (`recurrence.ts`, `TaskCard.tsx`).
- Cards move only by pointer drag: `useTaskDrag.ts` mentions a keyboard route, but `TaskCard.tsx` has no move control.
- `TaskCard` is memoised, so everything it shows must come from its props (`task`, `today`, `dragging`) or its contexts. Anything that depends on the clock goes through `today`, which the board works out on each render; `new Date()` inside the card would go stale (`TaskCard.tsx`).
- `board.css` is global, not a module, so its class names (`.card`, `.column`) are shared app-wide (`../../main.tsx`).
- Only real columns are scroll-snap targets; the "New column" box is not. When the board paints before its columns arrive, that box is the only target, and the browser keeps it snapped as the columns land in front of it, which opened the board at its far end (`board.css`).

## Tests
`dragDrop.test.ts` (drop positions, hidden cards, insertion point), `filter.test.ts` (matching, stored filters, deleted assignees), `recurrence.test.ts` (dates, month clamping, next occurrence, `doneAtOf()`, `returnDate()`, due again, overdue). `actions.test.ts` (local store): the tick writes the entry and the task, the untick removes only that entry, Clear keeps repeats and history, auto-clear at seven days, a repeat revived in place, Restore in each of its cases, a move leaving `done` alone. `Board.test.tsx` (local store): the tick as a named checkbox, a double tap while a slow tick is on its way making one history entry, a failed tick coming back with no unhandled rejection, no tick badge without an emoji, done cards out of the drag targets, the fold closed with its count, Clear with its confirm, a failed tidy on open only warning, the search applying inside the fold. `BoardPage.test.tsx`: the restore note and outline, shown once. `history/groupByDay.test.ts` (local days either side of midnight, today, yesterday, older) and `history/HistoryPage.test.tsx` (empty state, grouping and who, "Someone" for a backfilled entry, the "Done by" filter, Restore landing on the board with the note, a double press during a slow Restore making one card, a failed Restore bringing its button back with no unhandled rejection, `LoadFailed` while the board's tasks cannot be read). The invite line on `BoardPage.tsx` is rendered in `../family/FamilyPage.test.tsx`; the History pill is tested in `../../app/Nav.test.tsx`.
