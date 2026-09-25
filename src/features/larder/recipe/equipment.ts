import { CookingPot, Layers, Soup, Utensils } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** A plausible icon for a piece of equipment, by what its name mentions. */
export function equipmentIcon(name: string): LucideIcon {
  const lower = name.toLowerCase();
  if (/foil|lid|paper|wrap/.test(lower)) return Layers;
  if (/bowl/.test(lower)) return Soup;
  if (/skillet|pan|pot|oven|wok|dish|tin|tray/.test(lower)) return CookingPot;
  return Utensils;
}
