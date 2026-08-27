import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_BP_SEASON = '@battle_pass_season';
const KEY_BP_PROGRESS = '@battle_pass_progress';
const KEY_BP_CLAIMED = '@battle_pass_claimed';

export interface BattlePassTier {
  tier: number;
  xpRequired: number; // cumulative XP needed to reach this tier
  reward: {
    type: 'xp' | 'water' | 'chest' | 'ticket' | 'title';
    label: string;
    value: number | string;
    emoji: string;
  };
  isMilestone: boolean; // tier 10, 20, 30
}

export interface BattlePassProgress {
  season: string; // e.g. "2026-08"
  currentXp: number;
  currentTier: number;
  claimedTiers: number[];
}

function getCurrentSeason(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const BATTLE_PASS_TIERS: BattlePassTier[] = [
  { tier: 1,  xpRequired: 0,    isMilestone: false, reward: { type: 'xp',     label: '+50 XP',         value: 50,  emoji: '⭐' } },
  { tier: 2,  xpRequired: 100,  isMilestone: false, reward: { type: 'water',  label: '+2 Tetes Air',   value: 2,   emoji: '💧' } },
  { tier: 3,  xpRequired: 220,  isMilestone: false, reward: { type: 'xp',     label: '+75 XP',         value: 75,  emoji: '⭐' } },
  { tier: 4,  xpRequired: 370,  isMilestone: false, reward: { type: 'chest',  label: '1 Kotak Hadiah', value: 1,   emoji: '🎁' } },
  { tier: 5,  xpRequired: 550,  isMilestone: false, reward: { type: 'water',  label: '+3 Tetes Air',   value: 3,   emoji: '💧' } },
  { tier: 6,  xpRequired: 760,  isMilestone: false, reward: { type: 'xp',     label: '+100 XP',        value: 100, emoji: '⭐' } },
  { tier: 7,  xpRequired: 1000, isMilestone: false, reward: { type: 'ticket', label: '2 Tiket Roda',   value: 2,   emoji: '🎰' } },
  { tier: 8,  xpRequired: 1270, isMilestone: false, reward: { type: 'xp',     label: '+120 XP',        value: 120, emoji: '⭐' } },
  { tier: 9,  xpRequired: 1570, isMilestone: false, reward: { type: 'chest',  label: '2 Kotak Hadiah', value: 2,   emoji: '🎁' } },
  { tier: 10, xpRequired: 1900, isMilestone: true,  reward: { type: 'title',  label: 'Gelar: Pendekar Pomodoro', value: 'pendekar_pomodoro', emoji: '🏅' } },
  { tier: 11, xpRequired: 2260, isMilestone: false, reward: { type: 'xp',     label: '+150 XP',        value: 150, emoji: '⭐' } },
  { tier: 12, xpRequired: 2650, isMilestone: false, reward: { type: 'water',  label: '+5 Tetes Air',   value: 5,   emoji: '💧' } },
  { tier: 13, xpRequired: 3070, isMilestone: false, reward: { type: 'chest',  label: '2 Kotak Hadiah', value: 2,   emoji: '🎁' } },
  { tier: 14, xpRequired: 3520, isMilestone: false, reward: { type: 'ticket', label: '3 Tiket Roda',   value: 3,   emoji: '🎰' } },
  { tier: 15, xpRequired: 4000, isMilestone: false, reward: { type: 'xp',     label: '+200 XP',        value: 200, emoji: '⭐' } },
  { tier: 16, xpRequired: 4510, isMilestone: false, reward: { type: 'water',  label: '+5 Tetes Air',   value: 5,   emoji: '💧' } },
  { tier: 17, xpRequired: 5050, isMilestone: false, reward: { type: 'chest',  label: '3 Kotak Hadiah', value: 3,   emoji: '🎁' } },
  { tier: 18, xpRequired: 5620, isMilestone: false, reward: { type: 'xp',     label: '+250 XP',        value: 250, emoji: '⭐' } },
  { tier: 19, xpRequired: 6220, isMilestone: false, reward: { type: 'ticket', label: '4 Tiket Roda',   value: 4,   emoji: '🎰' } },
  { tier: 20, xpRequired: 6850, isMilestone: true,  reward: { type: 'title',  label: 'Gelar: Legenda Arena', value: 'legenda_arena', emoji: '🏆' } },
  { tier: 21, xpRequired: 7510, isMilestone: false, reward: { type: 'xp',     label: '+300 XP',        value: 300, emoji: '⭐' } },
  { tier: 22, xpRequired: 8200, isMilestone: false, reward: { type: 'water',  label: '+8 Tetes Air',   value: 8,   emoji: '💧' } },
  { tier: 23, xpRequired: 8920, isMilestone: false, reward: { type: 'chest',  label: '3 Kotak Hadiah', value: 3,   emoji: '🎁' } },
  { tier: 24, xpRequired: 9670, isMilestone: false, reward: { type: 'ticket', label: '5 Tiket Roda',   value: 5,   emoji: '🎰' } },
  { tier: 25, xpRequired: 10450,isMilestone: false, reward: { type: 'xp',     label: '+350 XP',        value: 350, emoji: '⭐' } },
  { tier: 26, xpRequired: 11260,isMilestone: false, reward: { type: 'water',  label: '+10 Tetes Air',  value: 10,  emoji: '💧' } },
  { tier: 27, xpRequired: 12100,isMilestone: false, reward: { type: 'chest',  label: '4 Kotak Hadiah', value: 4,   emoji: '🎁' } },
  { tier: 28, xpRequired: 12970,isMilestone: false, reward: { type: 'ticket', label: '6 Tiket Roda',   value: 6,   emoji: '🎰' } },
  { tier: 29, xpRequired: 13870,isMilestone: false, reward: { type: 'xp',     label: '+500 XP',        value: 500, emoji: '⭐' } },
  { tier: 30, xpRequired: 14800,isMilestone: true,  reward: { type: 'title',  label: 'Gelar: Ultima Scholar', value: 'ultima_scholar', emoji: '💎' } },
];

export async function getBattlePassProgress(): Promise<BattlePassProgress> {
  try {
    const season = getCurrentSeason();
    const raw = await AsyncStorage.getItem(KEY_BP_PROGRESS);
    const stored: BattlePassProgress | null = raw ? JSON.parse(raw) : null;
    // New season — reset
    if (!stored || stored.season !== season) {
      const fresh: BattlePassProgress = { season, currentXp: 0, currentTier: 1, claimedTiers: [1] };
      await AsyncStorage.setItem(KEY_BP_PROGRESS, JSON.stringify(fresh));
      return fresh;
    }
    return stored;
  } catch {
    const season = getCurrentSeason();
    return { season, currentXp: 0, currentTier: 1, claimedTiers: [1] };
  }
}

export async function addBattlePassXp(xp: number): Promise<{ newTier: number; prevTier: number; tiersUnlocked: number[] }> {
  try {
    const progress = await getBattlePassProgress();
    const prevTier = progress.currentTier;
    progress.currentXp += xp;

    // Calculate new tier
    let newTier = prevTier;
    for (const t of BATTLE_PASS_TIERS) {
      if (progress.currentXp >= t.xpRequired && t.tier > newTier) {
        newTier = t.tier;
      }
    }
    const tiersUnlocked = Array.from({ length: newTier - prevTier }, (_, i) => prevTier + i + 1);
    progress.currentTier = newTier;
    await AsyncStorage.setItem(KEY_BP_PROGRESS, JSON.stringify(progress));
    return { newTier, prevTier, tiersUnlocked };
  } catch { return { newTier: 1, prevTier: 1, tiersUnlocked: [] }; }
}

export async function claimBattlePassTier(tier: number): Promise<boolean> {
  try {
    const progress = await getBattlePassProgress();
    if (progress.claimedTiers.includes(tier)) return false;
    if (progress.currentTier < tier) return false;
    progress.claimedTiers.push(tier);
    await AsyncStorage.setItem(KEY_BP_PROGRESS, JSON.stringify(progress));
    return true;
  } catch { return false; }
}

export function getBattlePassSeasonDaysLeft(): number {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return lastDay.getDate() - now.getDate();
}
