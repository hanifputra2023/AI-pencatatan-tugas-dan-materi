import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

export type BossType =
  | 'boss_1'
  | 'boss_2'
  | 'boss_3'
  | 'boss_4'
  | 'boss_5'
  | 'boss_6'
  | 'boss_7'
  | 'boss_8'
  | 'golem'
  | 'dragon'
  | 'specter'
  | 'griffin';

export interface BossInfo {
  id: BossType;
  gifKey: string;
  name: string;
  title: string;
  themeSubject: string;
  accentColor: string;
  maxHp: number;
}

/** Deterministic string hash → always same number for same input */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// 8 Animated GIF Monster Bosses with transparent background
export const BOSS_GIF_MAP: Record<string, any> = {
  'boss_1': require('../../assets/boss_gifs/09ec3e3954311081fbfd1810322ace1f.gif'),
  'boss_2': require('../../assets/boss_gifs/44c82a7b1dad32c867fc875b774d1a4e.gif'),
  'boss_3': require('../../assets/boss_gifs/827b275735531b75f0aceab6a760bcb5.gif'),
  'boss_4': require('../../assets/boss_gifs/a0ce777ac35868917f425f73a84c0ce5.gif'),
  'boss_5': require('../../assets/boss_gifs/bqvcryfqaujy.gif'),
  'boss_6': require('../../assets/boss_gifs/decc640148693d24cbccfce9262d16ae.gif'),
  'boss_7': require('../../assets/boss_gifs/R.gif'),
  'boss_8': require('../../assets/boss_gifs/z6jilmhw8rty.gif'),
};

const ALL_BOSS_KEYS = ['boss_1', 'boss_2', 'boss_3', 'boss_4', 'boss_5', 'boss_6', 'boss_7', 'boss_8'];

const BOSS_NAMES: Record<string, string[]> = {
  boss_1: ['Titan Calculus Golem', 'Giga Matrix Colossus', 'Ancient Formula Dynamo'],
  boss_2: ['Cyber Algorithm Dragon', 'Leviathan Binary Protocol', 'Mecha Code Serpent'],
  boss_3: ['Apex Mecha Compiler', 'Glitch Core Wyvern', 'Neon Circuit Beast'],
  boss_4: ['Shadow Deadline Specter', 'Phantom of Unfinished Tasks', 'Dread Sovereign of Urgency'],
  boss_5: ['Void Procrastination Wraith', 'Eclipse Exam Spirit', 'Chronos Pressure Shade'],
  boss_6: ['Grand Chancellor of Theory', 'Apex Griffin of Knowledge', 'Sovereign Analytic Eagle'],
  boss_7: ['Imperial Court of Wisdom', 'Mythic Law Colossus', 'Regal Thought Titan'],
  boss_8: ['Celestial Abstract Monarch', 'High Council of Reason', 'Eternal Truth Arbiter'],
};

const BOSS_ACCENTS: Record<string, string> = {
  boss_1: '#38BDF8', boss_2: '#22D3EE', boss_3: '#06B6D4',
  boss_4: '#C084FC', boss_5: '#A855F7', boss_6: '#FBBF24',
  boss_7: '#F59E0B', boss_8: '#FB923C',
};

function makeBossInfo(key: string, noteTitle: string, subject: string): BossInfo {
  const hash = hashStr(noteTitle + subject + key);
  const names = BOSS_NAMES[key] || BOSS_NAMES['boss_1'];
  return {
    id: key as BossType,
    gifKey: key,
    name: `${names[hash % names.length]}`,
    title: `Musuh Materi ${subject || noteTitle || 'Kuliah'}`.slice(0, 40),
    themeSubject: subject || noteTitle || 'Kuliah',
    accentColor: BOSS_ACCENTS[key] || '#38BDF8',
    maxHp: 100,
  };
}

export function getDynamicBoss(noteTitle?: string, subject?: string): BossInfo {
  const cleanTitle = (noteTitle || '').trim();
  const cleanSubj = (subject || '').trim();
  const hash = hashStr(cleanTitle + cleanSubj);
  // Pick boss deterministically from all 8 based on note identity
  const bossKey = ALL_BOSS_KEYS[hash % ALL_BOSS_KEYS.length];
  return makeBossInfo(bossKey, cleanTitle, cleanSubj);
}

/** Phase 2 boss: always a DIFFERENT GIF from boss 1 */
export function getDynamicBossTwo(boss1Key: string, noteTitle?: string, subject?: string): BossInfo {
  const cleanTitle = (noteTitle || '').trim();
  const cleanSubj = (subject || '').trim();
  const hash = hashStr(cleanTitle + cleanSubj);
  // Pick a different key by offset +4 (wraps around, guaranteed different for 8 bosses)
  const boss1Idx = ALL_BOSS_KEYS.indexOf(boss1Key);
  const boss2Idx = (boss1Idx + 4) % ALL_BOSS_KEYS.length;
  const bossKey = ALL_BOSS_KEYS[boss2Idx];
  return makeBossInfo(bossKey, cleanTitle, cleanSubj);
}

export function getBossForSubject(subject?: string): BossInfo {
  return getDynamicBoss(undefined, subject);
}

interface BossAvatarIllustrationProps {
  bossId?: BossType | string;
  size?: number;
  isHit?: boolean;
}

export default function BossAvatarIllustration({
  bossId = 'boss_1',
  size = 110,
  isHit = false,
}: BossAvatarIllustrationProps) {
  // Map legacy ids to gif keys if needed
  let finalKey = bossId;
  if (bossId === 'golem') finalKey = 'boss_1';
  else if (bossId === 'dragon') finalKey = 'boss_2';
  else if (bossId === 'specter') finalKey = 'boss_4';
  else if (bossId === 'griffin') finalKey = 'boss_6';

  const gifSource = BOSS_GIF_MAP[finalKey] || BOSS_GIF_MAP['boss_1'];

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Image
        source={gifSource}
        style={[
          styles.gifImg,
          { width: size, height: size },
          isHit && { opacity: 0.6, transform: [{ scale: 0.95 }] },
        ]}
        resizeMode="contain"
      />
      {isHit && (
        <View
          style={[
            styles.hitOverlay,
            { width: size, height: size, borderRadius: size / 2 },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  gifImg: {
    width: '100%',
    height: '100%',
  },
  hitOverlay: {
    position: 'absolute',
    backgroundColor: 'rgba(239, 68, 68, 0.4)',
  },
});
