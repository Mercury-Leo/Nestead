# board
The kanban board and home page: the family's columns and task cards, with drag and drop, filters and repeating chores.

## Files
| File | Responsibility |
| --- | --- |
| `BoardPage.tsx` | The page: who you are ("I am" picker in demo mode), Family link, sign out, invite banner while alone. |
| `Board.tsx` | Filter bar, ordered columns, drop handling, reviving due repeats, the drag ghost portal. |
| `Column.tsx` | Rename, move, delete (only when empty) and fold a column; its cards and composer. |
| `TaskCard.tsx` | A card; expanded: description, due date, repeat, icon, assignee, delete. |
| `TaskComposer.tsx` | Adds a task; the arrow opens description, due date, repeat and assignee. |
| `DueDateInput.tsx` | A date field that reports only whole dates. |
| `useTaskDrag.ts` | Pointer-event dragging of cards: ghost, target column, insertion line, edge scrolling. |
| `dragDrop.ts` (+ `dragDrop.test.ts`) | `dropPosition()` and `insertionBefore()`: where a dropped card lands, without the DOM. |
| `filter.ts` (+ `filter.test.ts`) | `TaskFilter`, `matchesFilter()`, `parseFilter()`, `withKnownAssignee()`. |
| `recurrence.ts` (+ `recurrence.test.ts`) | `REPEAT_OPTIONS`, `nextOccurrence()`, `isDueAgain()`, `isOverdue()`, local-date helpers. |
| `actions.ts` | Store writes: `placeTask()`, `reviveRecurring()`, `moveColumn()`, `endPosition()`. |
| `defaultColumns.ts` | `seedDefaultColumns()`: To do, Doing, Done for a family with no columns. |
| `icons.ts` | `TASK_ICONS` (emoji) and `DEFAULT_TASK_ICON`. |
| `board.css` | Global class names for the whole board, imported in `../../main.tsx`. |

## How it works
- A drop runs `dropPosition()` over every task in the column, hidden ones included (`Board.tsx`), then `placeTask()`, which copies `done` from the new column's `isDone` and moves a completed repeat's `dueDate` to its next occurrence (`actions.ts`).
- `reviveRecurring()` runs when the board loads: done repeats whose date has arrived go back to the first non-done column. There is no server job (`Board.tsx`, `actions.ts`).
- The filter is saved per family on this device as the preference `boardFilter` (`Board.tsx`).
- Below 768px (`useIsNarrow()`) columns stack and fold, done columns folded first (`Board.tsx`). A mouse drags after 5px, a finger after a 350ms press (`useTaskDrag.ts`).
- Design background: [ARCHITECTURE.md](../../../docs/ARCHITECTURE.md#the-board).

## Connections
- Uses: `../../auth/session.tsx`, `../../data/useCollection.ts`, `../../data/local/localStore.ts`, `../../domain/position.ts`, `../../hooks/`, `../../components/`, `../../i18n/`.
- Used by: `../../app/AppRoutes.tsx`, `../../auth/*Session.tsx` (`seedDefaultColumns`), `../../main.tsx` (`board.css`), `../lists/useSectionDrag.ts` (`insertionBefore`).

## Rules & gotchas
- `Task.done` must equal its column's `isDone`: `placeTask()`, `TaskComposer.tsx` (on create) and `reviveRecurring()` (only into a non-done column) keep it so.
- `recurFrom` stays apart from `dueDate` so a chore on the 31st returns to the 31st; setting a new due date resets it (`recurrence.ts`, `TaskCard.tsx`).
- Cards move only by pointer drag: `useTaskDrag.ts` mentions a keyboard route, but `TaskCard.tsx` has no move control.
- `board.css` is global, not a module, so its class names (`.card`, `.column`) are shared app-wide (`../../main.tsx`).

## Tests
`dragDrop.test.ts` (drop positions, hidden cards, insertion point), `filter.test.ts` (matching, stored filters, deleted assignees), `recurrence.test.ts` (dates, month clamping, next occurrence, due again, overdue).
