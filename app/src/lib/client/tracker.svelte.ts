import { apiFetch } from './api';
import { toast } from './toast.svelte';
import type { CountRow } from '$lib/game/inventory';
import type { Tier } from '$lib/game/tiers';

type ProfileRow = { id: number; userId: number; owner: string; name: string; cycle: number; currentRebirth: number };

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
		plans: structuredClone(data.plansByCycle) as Record<number, Record<number, number[]>>
	});
	const active = () => state.profiles.find((p) => p.id === state.activeId) ?? null;
	const editable = () => active()?.userId === data.user.id;
	return {
		state, active, editable,
		myProfiles: () => mine,
		selectProfile(id: number) { state.activeId = id; },
		countRows: () => state.counts[state.activeId ?? -1] ?? [],
		planFor: (cycle: number) => state.plans[state.activeId ?? -1]?.[cycle] ?? [],
		async setCount(cycle: number, droid: string, tier: Tier, n: number) {
			const pid = state.activeId;
			if (pid == null || !editable()) return;
			const rows = (state.counts[pid] ??= []);
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
			((state.plans[pid] ??= {})[cycle] = rebirths);
			try {
				await apiFetch(`/api/profiles/${pid}/plans/${cycle}`, {
					method: 'PUT', body: JSON.stringify({ rebirths })
				});
			} catch (e) {
				state.plans[pid][cycle] = prev;
				toast(`Save failed: ${(e as Error).message}`);
			}
		}
	};
}
