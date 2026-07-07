import { getContext, setContext } from 'svelte';
import type { makeTracker } from './tracker.svelte';

export type Tracker = ReturnType<typeof makeTracker>;

const KEY = Symbol('tracker');
export const setTracker = (t: Tracker) => setContext(KEY, t);
export const getTracker = () => getContext<Tracker>(KEY);
