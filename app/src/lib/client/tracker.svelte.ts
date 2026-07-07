import { apiFetch } from './api';
import { toast } from './toast.svelte';
import type { CountRow } from '$lib/game/inventory';
import { RIDX, type Tier } from '$lib/game/tiers';

type ProfileRow = {
	id: number; userId: number; owner: string; name: string;
	cycle: number; currentRebirth: number; prefs: unknown
};

export function makeTracker(data: {
	user: { id: number };
	profiles: ProfileRow[];
	countsByProfile: Record<number, CountRow[]>;
	plansByCycle: Record<number, Record<number, number[]>>;
}) {
	const mine = data.profiles.filter((p) => p.userId === data.user.id);
	const state = $state({
		profiles: data.profiles,
		activeId: mine[0]?.id ?? data.profiles[0]?.id ?? null,
		counts: structuredClone(data.countsByProfile) as Record<number, CountRow[]>,
		plans: structuredClone(data.plansByCycle) as Record<number, Record<number, number[]>>,
		hideDoneOverride: null as boolean | null
	});
	const active = () => state.profiles.find((p) => p.id === state.activeId) ?? null;
	const editable = () => active()?.userId === data.user.id;
	let rbTimer: ReturnType<typeof setTimeout> | undefined;
	let rbPrev: number | null = null;
	let rbProfile: ProfileRow | null = null;
	// send the pending rebirth PATCH for `p`, rolling back to `prev` + toasting on failure
	const flushRebirthSave = (p: ProfileRow, prev: number) => {
		const current = p.currentRebirth;
		apiFetch(`/api/profiles/${p.id}`, {
			method: 'PATCH', body: JSON.stringify({ currentRebirth: current })
		}).catch((e) => {
			p.currentRebirth = prev;
			toast(`Save failed: ${(e as Error).message}`);
		});
	};
	// flush (and clear) any pending debounced rebirth save, e.g. before switching profiles
	const flushPendingRebirth = () => {
		clearTimeout(rbTimer);
		rbTimer = undefined;
		if (rbProfile && rbPrev !== null) flushRebirthSave(rbProfile, rbPrev);
		rbProfile = null;
		rbPrev = null;
	};
	return {
		state, active, editable,
		myProfiles: () => mine,
		selectProfile(id: number) {
			flushPendingRebirth();
			state.activeId = id;
			state.hideDoneOverride = null;
		},
		countRows: () => state.counts[state.activeId ?? -1] ?? [],
		planFor: (cycle: number) => state.plans[state.activeId ?? -1]?.[cycle] ?? [],
		async setCount(cycle: number, droid: string, tier: Tier, n: number) {
			const pid = state.activeId;
			if (pid == null || !editable()) return;
			if (!state.counts[pid]) state.counts[pid] = [];
			const rows = state.counts[pid];
			const i = rows.findIndex((r) => r.cycle === cycle && r.droid === droid && r.tier === tier);
			const prev = i >= 0 ? rows[i].n : 0;
			if (n <= 0 && i >= 0) rows.splice(i, 1);
			else if (i >= 0) rows[i].n = n;
			else if (n > 0) rows.push({ cycle, droid, tier, n });
			try {
				await apiFetch(`/api/profiles/${pid}/counts/${cycle}/${encodeURIComponent(droid)}/${tier}`, {
					method: 'PUT', body: JSON.stringify({ n: Math.max(0, n) })
				});
			} catch (e) {
				// rollback
				const j = rows.findIndex((r) => r.cycle === cycle && r.droid === droid && r.tier === tier);
				if (j >= 0) { if (prev === 0) rows.splice(j, 1); else rows[j].n = prev; }
				else if (prev > 0) rows.push({ cycle, droid, tier, n: prev });
				toast(`Save failed: ${(e as Error).message}`);
			}
		},
		async replacePlan(cycle: number, rebirths: number[]) {
			const pid = state.activeId;
			if (pid == null || !editable()) return;
			const prev = state.plans[pid]?.[cycle] ?? [];
			if (!state.plans[pid]) state.plans[pid] = {};
			state.plans[pid][cycle] = rebirths;
			try {
				await apiFetch(`/api/profiles/${pid}/plans/${cycle}`, {
					method: 'PUT', body: JSON.stringify({ rebirths })
				});
			} catch (e) {
				state.plans[pid][cycle] = prev;
				toast(`Save failed: ${(e as Error).message}`);
			}
		},
		cycle: () => active()?.cycle ?? 1,
		rebirth: () => Math.min(27, Math.max(1, active()?.currentRebirth ?? 1)),
		hideDone(): boolean {
			if (!editable() && state.hideDoneOverride !== null) return state.hideDoneOverride;
			return ((active()?.prefs ?? {}) as { hideDone?: boolean }).hideDone ?? false;
		},
		async setCycle(n: 1 | 2) {
			const p = active();
			if (!p || !editable() || p.cycle === n) return;
			const prev = p.cycle;
			p.cycle = n;
			try {
				await apiFetch(`/api/profiles/${p.id}`, { method: 'PATCH', body: JSON.stringify({ cycle: n }) });
			} catch (e) {
				p.cycle = prev;
				toast(`Save failed: ${(e as Error).message}`);
			}
		},
		setRebirth(n: number) {
			const p = active();
			if (!p || !editable()) return;
			const v = Math.min(27, Math.max(1, Math.round(n)));
			if (rbPrev === null) { rbPrev = p.currentRebirth; rbProfile = p; }
			p.currentRebirth = v;
			clearTimeout(rbTimer);
			// coalesce rapid stepper clicks into one PATCH
			rbTimer = setTimeout(flushPendingRebirth, 400);
		},
		async setHideDone(b: boolean) {
			const p = active();
			if (!p) return;
			if (!editable()) {
				// viewing someone else's profile: local view state only
				state.hideDoneOverride = b;
				return;
			}
			const prevPrefs = { ...((p.prefs ?? {}) as Record<string, unknown>) };
			p.prefs = { ...prevPrefs, hideDone: b };
			try {
				await apiFetch(`/api/profiles/${p.id}`, { method: 'PATCH', body: JSON.stringify({ prefs: p.prefs }) });
			} catch (e) {
				p.prefs = prevPrefs;
				toast(`Save failed: ${(e as Error).message}`);
			}
		},
		countsFor(cycle: number, droid: string): number[] {
			const out = [0, 0, 0, 0, 0];
			for (const r of state.counts[state.activeId ?? -1] ?? [])
				if (r.cycle === cycle && r.droid === droid) out[RIDX[r.tier]] += r.n;
			return out;
		}
	};
}
