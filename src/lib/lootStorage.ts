import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_CHEST_COUNT = "@loot_chest_count";
const KEY_SPIN_TICKETS = "@loot_spin_tickets";
const KEY_EQUIPPED_TITLE = "@loot_equipped_title";
const KEY_UNLOCKED_TITLES = "@loot_unlocked_titles";
const KEY_LAST_DAILY_SPIN = "@loot_last_daily_spin";

export interface RpgTitle {
  id: string;
  name: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  color: string;
  bgColor: string;
  icon: string;
  desc: string;
}

export const ALL_RPG_TITLES: RpgTitle[] = [
  { id: "pejuang_pemula", name: "🌱 Pejuang Pemula", rarity: "common", color: "#10B981", bgColor: "#D1FAE5", icon: "leaf", desc: "Baru memulai perjalanan ilmu" },
  { id: "pemburu_tugas", name: "🎯 Pemburu Tugas", rarity: "common", color: "#3B82F6", bgColor: "#DBEAFE", icon: "target", desc: "Selalu menuntaskan kewajiban" },
  { id: "arsitek_kode", name: "💻 Arsitek Kode", rarity: "rare", color: "#06B6D4", bgColor: "#CFFAFE", icon: "code-slash", desc: "Pakar logika pemrograman" },
  { id: "penakluk_kalkulus", name: "📐 Penakluk Kalkulus", rarity: "rare", color: "#8B5CF6", bgColor: "#EDE9FE", icon: "calculator", desc: "Tidak gentar rumus rumit" },
  { id: "dewa_begadang", name: "🌙 Penguasa Malam", rarity: "rare", color: "#6366F1", bgColor: "#E0E7FF", icon: "moon", desc: "Produktif di heningnya malam" },
  { id: "master_pomodoro", name: "🍅 Master Fokus 25 Menit", rarity: "epic", color: "#EF4444", bgColor: "#FEE2E2", icon: "timer", desc: "Konsistensi fokus baja" },
  { id: "pembantai_bos", name: "⚔️ Algojo Bos Materi", rarity: "epic", color: "#F59E0B", bgColor: "#FEF3C7", icon: "skull", desc: "Menaklukkan berbagai bos RPG" },
  { id: "dewa_penakluk", name: "👑 Sang Raja Pengetahuan", rarity: "legendary", color: "#FBBF24", bgColor: "#FEF9C3", icon: "trophy", desc: "Penguasa sejati seluruh materi" },
  { id: "arsitek_semesta", name: "🌌 Jenius Multidimensi", rarity: "legendary", color: "#EC4899", bgColor: "#FCE7F3", icon: "planet", desc: "Pemahaman tanpa batas ruang" },
];

export async function getChestCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(KEY_CHEST_COUNT);
    return raw ? parseInt(raw, 10) : 1; // 1 free starter chest
  } catch (e) {
    return 1;
  }
}

export async function addChest(amount = 1): Promise<number> {
  try {
    const current = await getChestCount();
    const next = current + amount;
    await AsyncStorage.setItem(KEY_CHEST_COUNT, String(next));
    return next;
  } catch (e) {
    return 1;
  }
}

export async function getSpinTickets(): Promise<number> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const lastDaily = await AsyncStorage.getItem(KEY_LAST_DAILY_SPIN);
    let tickets = parseInt(await AsyncStorage.getItem(KEY_SPIN_TICKETS) ?? "1", 10);

    if (lastDaily !== today) {
      tickets += 1; // +1 Free daily spin ticket
      await AsyncStorage.setItem(KEY_LAST_DAILY_SPIN, today);
      await AsyncStorage.setItem(KEY_SPIN_TICKETS, String(tickets));
    }
    return tickets;
  } catch (e) {
    return 1;
  }
}

export async function addSpinTicket(amount = 1): Promise<number> {
  try {
    const current = await getSpinTickets();
    const next = current + amount;
    await AsyncStorage.setItem(KEY_SPIN_TICKETS, String(next));
    return next;
  } catch (e) {
    return 1;
  }
}

export async function consumeSpinTicket(): Promise<boolean> {
  try {
    const current = await getSpinTickets();
    if (current <= 0) return false;
    await AsyncStorage.setItem(KEY_SPIN_TICKETS, String(current - 1));
    return true;
  } catch (e) {
    return false;
  }
}

export async function getUnlockedTitles(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_UNLOCKED_TITLES);
    return raw ? JSON.parse(raw) : ["pejuang_pemula"];
  } catch (e) {
    return ["pejuang_pemula"];
  }
}

export async function unlockTitle(id: string): Promise<boolean> {
  try {
    const current = await getUnlockedTitles();
    if (current.includes(id)) return false;
    const next = [...current, id];
    await AsyncStorage.setItem(KEY_UNLOCKED_TITLES, JSON.stringify(next));
    return true;
  } catch (e) {
    return false;
  }
}

export async function getEquippedTitle(): Promise<RpgTitle> {
  try {
    const id = await AsyncStorage.getItem(KEY_EQUIPPED_TITLE);
    const found = ALL_RPG_TITLES.find((t) => t.id === id);
    return found || ALL_RPG_TITLES[0];
  } catch (e) {
    return ALL_RPG_TITLES[0];
  }
}

export async function equipTitle(id: string): Promise<RpgTitle> {
  await AsyncStorage.setItem(KEY_EQUIPPED_TITLE, id);
  return ALL_RPG_TITLES.find((t) => t.id === id) || ALL_RPG_TITLES[0];
}

export interface ChestLootResult {
  xp: number;
  waterDrops: number;
  unlockedTitle?: RpgTitle;
  rarity: "common" | "rare" | "epic" | "legendary";
}

export async function openChest(): Promise<ChestLootResult | null> {
  const count = await getChestCount();
  if (count <= 0) return null;
  await AsyncStorage.setItem(KEY_CHEST_COUNT, String(count - 1));

  const rand = Math.random() * 100;
  let rarity: "common" | "rare" | "epic" | "legendary" = "common";
  let xp = 25;
  let waterDrops = 1;

  if (rand > 92) {
    rarity = "legendary";
    xp = 150 + Math.floor(Math.random() * 100);
    waterDrops = 4 + Math.floor(Math.random() * 3);
  } else if (rand > 70) {
    rarity = "epic";
    xp = 80 + Math.floor(Math.random() * 40);
    waterDrops = 3;
  } else if (rand > 35) {
    rarity = "rare";
    xp = 45 + Math.floor(Math.random() * 25);
    waterDrops = 2;
  } else {
    rarity = "common";
    xp = 25 + Math.floor(Math.random() * 15);
    waterDrops = 1;
  }

  // Chance to unlock title of this rarity
  let unlockedTitle: RpgTitle | undefined;
  const matchingTitles = ALL_RPG_TITLES.filter((t) => t.rarity === rarity);
  const unlocked = await getUnlockedTitles();
  const candidates = matchingTitles.filter((t) => !unlocked.includes(t.id));

  if (candidates.length > 0 && Math.random() > 0.3) {
    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    await unlockTitle(picked.id);
    unlockedTitle = picked;
  }

  return { xp, waterDrops, unlockedTitle, rarity };
}
