import { useTranslation } from 'react-i18next';
import type { WebRecipeHit } from '../../../../server/search';
import { RecipeList } from '../recipe/RecipeCard';
import { RecipePhoto } from '../recipe/RecipePhoto';
import s from './ImportRecipe.module.css';

/**
 * "Search online" results: pages that have not been read yet, so a title, the
 * site and, where the search found one, a picture. Choosing one imports it, as
 * pasting its link would.
 */
export function WebResults({ hits, opening, onChoose }: { hits: WebRecipeHit[]; opening: string | null; onChoose: (hit: WebRecipeHit) => void }): JSX.Element {
  const { t } = useTranslation();
  const busy = opening !== null;
  return (
    <RecipeList>
      {hits.map((hit) => (
        <article key={hit.url} className={s.hit} aria-busy={opening === hit.url}>
          {hit.image !== undefined && (
            <button type="button" className={s.hitPhoto} tabIndex={-1} aria-hidden disabled={busy} onClick={() => onChoose(hit)}>
              <RecipePhoto recipe={{ title: hit.title, photoUrl: hit.image }} />
            </button>
          )}
          {/* The text runs the way its title does, so a Hebrew page's site line sits under its title. The title has no dir of its own: dir="auto" reads the first text without one. */}
          <div className={s.hitBody} dir="auto">
            <h3 className={s.hitTitle}>
              <button type="button" className={s.hitLink} disabled={busy} onClick={() => onChoose(hit)}>
                {hit.title}
              </button>
            </h3>
            <p className={s.hitSite}>{opening === hit.url ? t('import.fetching') : hit.site}</p>
          </div>
        </article>
      ))}
    </RecipeList>
  );
}
