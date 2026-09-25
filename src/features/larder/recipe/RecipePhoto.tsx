import { useEffect, useState } from 'react';
import { useSession } from '../../../auth/session';
import type { AnyRecipe } from '../../../domain/types';
import { cx } from '../../../components/ui';
import { PhotoPlaceholder } from './PhotoPlaceholder';

/**
 * The recipe's photo: its own (from the photo store), a remote one for web
 * recipes, or the linen-and-plate placeholder. Fills its container, any shape.
 */
export function RecipePhoto({
  recipe,
  className,
  eager = false,
}: {
  recipe: Pick<AnyRecipe, 'title' | 'photoId' | 'photoUrl'>;
  className?: string;
  eager?: boolean;
}): JSX.Element {
  const { store } = useSession();
  const [stored, setStored] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setStored(null);
    setFailed(false);
    if (recipe.photoId !== undefined) {
      void store.photos.url(recipe.photoId).then((url) => {
        if (active) setStored(url);
      });
    }
    return () => {
      active = false;
    };
  }, [store, recipe.photoId]);

  const src = stored ?? recipe.photoUrl ?? null;
  const style = { width: '100%', height: '100%' };

  if (src === null || failed) {
    return <PhotoPlaceholder title={recipe.title} className={className} />;
  }
  return (
    <img
      src={src}
      alt=""
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={cx(className)}
      style={{ ...style, objectFit: 'cover' }}
      onError={() => setFailed(true)}
    />
  );
}
