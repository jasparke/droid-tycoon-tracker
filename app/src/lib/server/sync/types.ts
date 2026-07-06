import type { Tier } from '$lib/game/tiers';
export type { Tier } from '$lib/game/tiers';   // re-export so sync modules import Tier from '../types'

export interface DroidRow { name: string; rarity: string; type: string; incomePct: number | null; buyNc: number | null; }
export interface DroidTierRow { droid: string; tier: Tier; buy: number | null; income: number | null; sell: number | null; }
export interface RebirthReqRow { cycle: number; rebirth: number; droid: string; tier: Tier; credits: string; unlock: string | null; }
export interface ChipCostRow { rarity: string; toGold: number | null; toDiamond: number | null; toRainbow: number | null; toBeskar: number | null; }
export interface RebirthMetaRow { rebirth: number; nova: number; creditMult: number; xpMult: number; }
export interface NovaShopRow { category: string; item: string; level: number; cost: number; }
export interface CosmeticRow { category: string; name: string; requirement: string; }
export interface SellValueRow { rarity: string; tier: Tier; multiplier: number; }
export interface FlawlessRow { tier: Tier; oneIn: number; }
export interface PaintStageRow { stage: number; crystalCost: number; }

export interface PayloadTables {
	droids: DroidRow[];
	droidTiers: DroidTierRow[];
	rebirthReqs: RebirthReqRow[];
	chipCosts: ChipCostRow[];
	rebirthMeta: RebirthMetaRow[];
	novaShop: NovaShopRow[];
	cosmetics: CosmeticRow[];
	droidSellValues: SellValueRow[];
	flawlessSpawn: FlawlessRow[];
	novaPaintStages: PaintStageRow[];
}

export interface OrphanRow { droid: string; tier: string; profileId: number; }
export interface PayloadMeta {
	source: string; fetchedAt: string;
	tabChecksums: Record<string, string>;
	rowCounts: Record<string, number>;
	orphanReport: OrphanRow[];
}
export interface Payload { meta: PayloadMeta; tables: PayloadTables; }

export type FlagKind = 'reject' | 'hold' | 'report';
export interface Flag { kind: FlagKind; code: string; message: string; table?: string; key?: string; }

export interface RowChange { key: string; before: unknown; after: unknown; }
export interface TableDiff { added: unknown[]; removed: unknown[]; changed: RowChange[]; }
export type DiffResult = Record<string, TableDiff>;
