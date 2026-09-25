import { runDataStoreContract } from '../collection.contract';
import { createLocalStore } from './localStore';

runDataStoreContract('local', createLocalStore, () => {
  localStorage.clear();
});
