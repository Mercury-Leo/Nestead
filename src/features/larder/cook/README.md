# cook
Cook mode (`/recipe/:id/cook?step=N`): full screen, one step at a time, with tap-to-start timers.

## Files
| File | Responsibility |
| --- | --- |
| `CookMode.tsx` (+ `CookMode.module.css`, also used by `TimerChips.tsx`) | Step view, ingredients drawer, keys and swipes, timer tray (default export). |
| `TimerChips.tsx` | `TimerChip` (a time in the step text) and `TrayCard` (a running timer). |
| `steps.ts` | `stepTitle()` and `stepIngredients()`. |

## How it works
- The step lives in `?step=` (1-based) and is clamped to the recipe (`CookMode.tsx`).
- Amounts scale by `servingsFor(recipe)`, the servings picked on the detail page (`CookMode.tsx`, `../recipe/servings.ts`).
- `StepText` turns times in the text into chips; pressing one starts, pauses or resumes its timer in `../timers/store.ts` (`CookMode.tsx`).
- `stepIngredients()` uses the step's `ingredientIds`, else the ingredients whose catalog name, alias or group appears in its text (`steps.ts`).
- Arrow keys and horizontal swipes of 60px or more change step, mirrored in RTL; Escape closes the phone drawer, then leaves (`CookMode.tsx`).
- `useWakeLock()` keeps the screen on; finishing clears this recipe's finished timers (`CookMode.tsx`).

## Connections
- Uses: `../timers/store.ts`, `../recipe/` (`StepText.tsx`, `servings.ts`, `recipeView.ts`), `../KitchenContext.tsx`, `../labels.ts`, `../../../hooks/` (`useDirection`, `useIsDesktop`, `useWakeLock`).
- Used by: `../../../app/AppRoutes.tsx`.

## Rules & gotchas
- A timer is matched to its chip by recipe id and `chipKey()`, which is the step index plus the time's character offset (`../recipe/StepText.tsx`). Editing a step's text moves the offsets.
- `../../../app/Shell.tsx` removes the sidebar and tab bar on this route.
- Cook mode keeps its own dark tokens in both themes (`CookMode.module.css`, per the header of `../../../styles/tokens.css`).
- Without a `title`, a step is named after its first timer's verb (`stepTitle()`); see [LARDER.md](../../../../docs/LARDER.md#where-it-differs-from-the-larder-brief).
