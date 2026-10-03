import { useState } from 'react';
import { readDevicePreference, writeDevicePreference } from '../../../data/local/localStore';

/**
 * Whether a recipe page shows calories per serving or per 100 g. Device
 * state, like the theme: someone who weighs their plate picks 100 g once and
 * every recipe opens that way on this device.
 */
export type KcalBasis = 'serving' | '100g';

const PREFERENCE = 'kcalBasis';

export function readKcalBasis(): KcalBasis {
  return readDevicePreference(PREFERENCE) === '100g' ? '100g' : 'serving';
}

export function useKcalBasis(): [KcalBasis, (basis: KcalBasis) => void] {
  const [basis, setBasis] = useState(readKcalBasis);
  return [
    basis,
    (next) => {
      writeDevicePreference(PREFERENCE, next);
      setBasis(next);
    },
  ];
}
