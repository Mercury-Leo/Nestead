import { KitchenProvider } from '../features/larder/KitchenContext';
import { Shell } from './Shell';

/**
 * The signed-in app: the board and the kitchen (Larder) in one shell. The
 * kitchen's shared rows are read once, here, for every screen and the nav.
 */
export function App(): JSX.Element {
  return (
    <KitchenProvider>
      <Shell />
    </KitchenProvider>
  );
}
