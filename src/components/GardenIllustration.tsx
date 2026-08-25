import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, {
  G, Path, Circle, Rect, Ellipse, Defs, LinearGradient, RadialGradient, Stop
} from 'react-native-svg';

interface GardenIllustrationProps {
  speciesId: 'sakura' | 'bonsai' | 'cactus' | 'sunflower';
  stage: 1 | 2 | 3 | 4; // 1: Seed, 2: Sprout, 3: Growing, 4: Blooming
  size?: number;
}

export default function GardenIllustration({
  speciesId,
  stage,
  size = 140,
}: GardenIllustrationProps) {
  const potScale = size / 140;

  // 1. Seedling / Pot Base (Stage 1)
  if (stage === 1) {
    return (
      <View style={[styles.container, { width: size, height: size }]}>
        <Svg width={size} height={size} viewBox="0 0 140 140">
          <Defs>
            <LinearGradient id="potGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#F8FAFC" />
              <Stop offset="1" stopColor="#CBD5E1" />
            </LinearGradient>
            <LinearGradient id="soilGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#5D4037" />
              <Stop offset="1" stopColor="#3E2723" />
            </LinearGradient>
            <LinearGradient id="leafGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#86EFAC" />
              <Stop offset="1" stopColor="#22C55E" />
            </LinearGradient>
          </Defs>

          {/* Soft Shadow Base */}
          <Ellipse cx="70" cy="128" rx="42" ry="7" fill="rgba(0,0,0,0.18)" />

          {/* Modern Ceramic Pot */}
          <Path d="M 38 78 L 46 122 Q 70 126 94 122 L 102 78 Z" fill="url(#potGrad)" />
          {/* Pot Rim */}
          <Ellipse cx="70" cy="78" rx="34" ry="7" fill="#E2E8F0" />
          {/* Soil */}
          <Ellipse cx="70" cy="78" rx="30" ry="5.5" fill="url(#soilGrad)" />

          {/* Tiny Green Sprout (Stage 1) */}
          <Path d="M 70 78 Q 70 60 70 56" stroke="#22C55E" strokeWidth="3" strokeLinecap="round" />
          {/* Left Leaf */}
          <Path d="M 70 60 Q 56 56 60 48 Q 68 52 70 60" fill="url(#leafGrad)" />
          {/* Right Leaf */}
          <Path d="M 70 58 Q 84 54 80 46 Q 72 50 70 58" fill="url(#leafGrad)" />

          {/* Sparkling Dew Drops */}
          <Circle cx="63" cy="50" r="1.5" fill="#E0F2FE" opacity={0.9} />
        </Svg>
      </View>
    );
  }

  // 2. Sprout Growing (Stage 2)
  if (stage === 2) {
    return (
      <View style={[styles.container, { width: size, height: size }]}>
        <Svg width={size} height={size} viewBox="0 0 140 140">
          <Defs>
            <LinearGradient id="potGrad2" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#F1F5F9" />
              <Stop offset="1" stopColor="#94A3B8" />
            </LinearGradient>
            <LinearGradient id="soilGrad2" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#4E342E" />
              <Stop offset="1" stopColor="#2E1C14" />
            </LinearGradient>
            <LinearGradient id="stemGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#16A34A" />
              <Stop offset="1" stopColor="#15803D" />
            </LinearGradient>
            <LinearGradient id="leafGrad2" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#4ADE80" />
              <Stop offset="1" stopColor="#16A34A" />
            </LinearGradient>
          </Defs>

          {/* Shadow */}
          <Ellipse cx="70" cy="128" rx="42" ry="7" fill="rgba(0,0,0,0.18)" />

          {/* Pot */}
          <Path d="M 38 82 L 46 122 Q 70 126 94 122 L 102 82 Z" fill="url(#potGrad2)" />
          <Ellipse cx="70" cy="82" rx="34" ry="7" fill="#E2E8F0" />
          <Ellipse cx="70" cy="82" rx="30" ry="5.5" fill="url(#soilGrad2)" />

          {/* Main Stem */}
          <Path d="M 70 82 Q 68 55 70 38" stroke="url(#stemGrad)" strokeWidth="4.5" strokeLinecap="round" fill="none" />

          {/* Leaf Tier 1 (Bottom) */}
          <Path d="M 70 68 Q 50 64 54 50 Q 66 58 70 68" fill="url(#leafGrad2)" />
          <Path d="M 70 64 Q 90 60 86 46 Q 74 54 70 64" fill="url(#leafGrad2)" />

          {/* Leaf Tier 2 (Top) */}
          <Path d="M 70 46 Q 52 40 58 28 Q 68 36 70 46" fill="url(#leafGrad2)" />
          <Path d="M 70 42 Q 88 36 82 24 Q 72 32 70 42" fill="url(#leafGrad2)" />

          {/* Top Bud */}
          <Circle cx="70" cy="36" r="3.5" fill="#86EFAC" />
        </Svg>
      </View>
    );
  }

  // 3 & 4. Species Specific Full Trees (Stages 3 & 4)
  const isBloomed = stage === 4;

  switch (speciesId) {
    case 'sakura':
      return (
        <View style={[styles.container, { width: size, height: size }]}>
          <Svg width={size} height={size} viewBox="0 0 140 140">
            <Defs>
              <LinearGradient id="sakuraPot" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#E2E8F0" />
                <Stop offset="1" stopColor="#64748B" />
              </LinearGradient>
              <LinearGradient id="sakuraTrunk" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#78350F" />
                <Stop offset="1" stopColor="#451A03" />
              </LinearGradient>
              <RadialGradient id="sakuraFoliage" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor="#FBCFE8" />
                <Stop offset="70%" stopColor="#F472B6" />
                <Stop offset="100%" stopColor="#DB2777" />
              </RadialGradient>
              <RadialGradient id="sakuraFoliageLight" cx="40%" cy="40%" r="60%">
                <Stop offset="0%" stopColor="#FDF2F8" />
                <Stop offset="80%" stopColor="#F472B6" />
              </RadialGradient>
            </Defs>

            {/* Shadow */}
            <Ellipse cx="70" cy="130" rx="46" ry="7" fill="rgba(0,0,0,0.22)" />

            {/* Elegant Bonsai Bowl Pot */}
            <Path d="M 32 94 L 42 124 Q 70 128 98 124 L 108 94 Z" fill="url(#sakuraPot)" />
            <Ellipse cx="70" cy="94" rx="40" ry="8" fill="#CBD5E1" />
            <Ellipse cx="70" cy="94" rx="36" ry="6" fill="#3E2723" />

            {/* Artistic Twisted Trunk */}
            <Path d="M 70 94 Q 64 74 74 62 Q 80 50 68 40" stroke="url(#sakuraTrunk)" strokeWidth="8" strokeLinecap="round" fill="none" />
            {/* Branches */}
            <Path d="M 68 66 Q 50 56 42 48" stroke="url(#sakuraTrunk)" strokeWidth="4.5" strokeLinecap="round" fill="none" />
            <Path d="M 74 54 Q 92 46 98 38" stroke="url(#sakuraTrunk)" strokeWidth="4.5" strokeLinecap="round" fill="none" />

            {/* Lush Pink Sakura Foliage Clouds */}
            <Circle cx="44" cy="44" r={isBloomed ? 20 : 15} fill="url(#sakuraFoliage)" />
            <Circle cx="96" cy="38" r={isBloomed ? 19 : 14} fill="url(#sakuraFoliage)" />
            <Circle cx="68" cy="30" r={isBloomed ? 26 : 20} fill="url(#sakuraFoliageLight)" />
            <Circle cx="70" cy="18" r={isBloomed ? 18 : 13} fill="url(#sakuraFoliage)" />

            {/* Blooming Petals Glow (Stage 4 Extra) */}
            {isBloomed && (
              <>
                <Circle cx="50" cy="24" r="3" fill="#FFF1F2" />
                <Circle cx="88" cy="22" r="2.5" fill="#FFF1F2" />
                <Circle cx="30" cy="56" r="2.5" fill="#F472B6" />
                <Circle cx="108" cy="52" r="3" fill="#F472B6" />
                {/* Floating Falling Petals */}
                <Path d="M 34 68 Q 30 74 36 78 Q 40 72 34 68" fill="#F472B6" />
                <Path d="M 104 64 Q 110 70 106 76 Q 100 72 104 64" fill="#F472B6" />
                <Circle cx="70" cy="9" r="2" fill="#FDE047" />
              </>
            )}
          </Svg>
        </View>
      );

    case 'bonsai':
      return (
        <View style={[styles.container, { width: size, height: size }]}>
          <Svg width={size} height={size} viewBox="0 0 140 140">
            <Defs>
              <LinearGradient id="bonsaiPot" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#78350F" />
                <Stop offset="1" stopColor="#451A03" />
              </LinearGradient>
              <LinearGradient id="bonsaiFoliage" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#22C55E" />
                <Stop offset="1" stopColor="#14532D" />
              </LinearGradient>
            </Defs>

            {/* Shadow */}
            <Ellipse cx="70" cy="130" rx="46" ry="7" fill="rgba(0,0,0,0.22)" />

            {/* Japanese Clay Pot */}
            <Path d="M 30 96 L 38 124 Q 70 127 102 124 L 110 96 Z" fill="url(#bonsaiPot)" />
            <Ellipse cx="70" cy="96" rx="42" ry="7" fill="#9A3412" />
            <Ellipse cx="70" cy="96" rx="38" ry="5.5" fill="#1C1917" />

            {/* Ancient Zen Trunk */}
            <Path d="M 70 96 Q 52 82 58 66 Q 66 48 84 46" stroke="#522504" strokeWidth="9" strokeLinecap="round" fill="none" />
            <Path d="M 58 66 Q 40 56 36 44" stroke="#522504" strokeWidth="5" strokeLinecap="round" fill="none" />
            <Path d="M 72 52 Q 88 38 98 32" stroke="#522504" strokeWidth="5" strokeLinecap="round" fill="none" />

            {/* Layered Pine Needle Pads */}
            <Ellipse cx="36" cy="42" rx={isBloomed ? 20 : 15} ry={isBloomed ? 11 : 8} fill="url(#bonsaiFoliage)" />
            <Ellipse cx="86" cy="44" rx={isBloomed ? 22 : 16} ry={isBloomed ? 12 : 9} fill="url(#bonsaiFoliage)" />
            <Ellipse cx="62" cy="28" rx={isBloomed ? 26 : 20} ry={isBloomed ? 14 : 10} fill="url(#bonsaiFoliage)" />
            <Ellipse cx="98" cy="28" rx={isBloomed ? 18 : 13} ry={isBloomed ? 10 : 7} fill="url(#bonsaiFoliage)" />

            {/* Master Zen Glow */}
            {isBloomed && (
              <>
                <Circle cx="62" cy="20" r="3" fill="#FEF08A" />
                <Circle cx="86" cy="36" r="2.5" fill="#FEF08A" />
                <Circle cx="36" cy="34" r="2.5" fill="#FEF08A" />
              </>
            )}
          </Svg>
        </View>
      );

    case 'cactus':
      return (
        <View style={[styles.container, { width: size, height: size }]}>
          <Svg width={size} height={size} viewBox="0 0 140 140">
            <Defs>
              <LinearGradient id="cactusPot" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#F97316" />
                <Stop offset="1" stopColor="#C2410C" />
              </LinearGradient>
              <LinearGradient id="cactusBody" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#15803D" />
                <Stop offset="50%" stopColor="#22C55E" />
                <Stop offset="100%" stopColor="#166534" />
              </LinearGradient>
            </Defs>

            {/* Shadow */}
            <Ellipse cx="70" cy="128" rx="42" ry="7" fill="rgba(0,0,0,0.18)" />

            {/* Terracotta Pot */}
            <Path d="M 38 86 L 46 122 Q 70 126 94 122 L 102 86 Z" fill="url(#cactusPot)" />
            <Ellipse cx="70" cy="86" rx="34" ry="7" fill="#FB923C" />
            <Ellipse cx="70" cy="86" rx="30" ry="5.5" fill="#543A2A" />

            {/* Main Cactus Body */}
            <Path d="M 54 86 C 54 44 86 44 86 86 Z" fill="url(#cactusBody)" />

            {/* Left Arm */}
            <Path d="M 56 68 Q 36 68 36 52 Q 36 40 44 40 Q 48 40 48 52 Q 48 60 56 62" fill="url(#cactusBody)" />

            {/* Right Arm */}
            <Path d="M 84 62 Q 104 62 104 46 Q 104 34 96 34 Q 92 34 92 46 Q 92 54 84 56" fill="url(#cactusBody)" />

            {/* Golden Flower on Top (Stage 4) */}
            {isBloomed && (
              <G>
                <Circle cx="70" cy="42" r="8" fill="#FBBF24" />
                <Circle cx="70" cy="42" r="5" fill="#F59E0B" />
                <Circle cx="70" cy="42" r="2.5" fill="#EF4444" />
                <Circle cx="44" cy="38" r="4" fill="#FBBF24" />
                <Circle cx="96" cy="32" r="4" fill="#FBBF24" />
              </G>
            )}
          </Svg>
        </View>
      );

    case 'sunflower':
    default:
      return (
        <View style={[styles.container, { width: size, height: size }]}>
          <Svg width={size} height={size} viewBox="0 0 140 140">
            <Defs>
              <LinearGradient id="sunPot" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#E2E8F0" />
                <Stop offset="1" stopColor="#94A3B8" />
              </LinearGradient>
              <LinearGradient id="sunPetal" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#FDE047" />
                <Stop offset="1" stopColor="#EAB308" />
              </LinearGradient>
            </Defs>

            {/* Shadow */}
            <Ellipse cx="70" cy="128" rx="42" ry="7" fill="rgba(0,0,0,0.18)" />

            {/* Pot */}
            <Path d="M 38 86 L 46 122 Q 70 126 94 122 L 102 86 Z" fill="url(#sunPot)" />
            <Ellipse cx="70" cy="86" rx="34" ry="7" fill="#CBD5E1" />
            <Ellipse cx="70" cy="86" rx="30" ry="5.5" fill="#3E2723" />

            {/* Stem */}
            <Path d="M 70 86 Q 66 60 70 42" stroke="#16A34A" strokeWidth="6" strokeLinecap="round" fill="none" />

            {/* Big Broad Leaves */}
            <Path d="M 70 74 Q 44 70 48 56 Q 62 64 70 74" fill="#22C55E" />
            <Path d="M 70 64 Q 96 60 92 46 Q 78 54 70 64" fill="#22C55E" />

            {/* Sunflower Head */}
            {isBloomed ? (
              <G>
                {/* Petals */}
                <Circle cx="70" cy="34" r="24" fill="url(#sunPetal)" />
                <Circle cx="70" cy="34" r="21" fill="#FACC15" />
                {/* Flower Core */}
                <Circle cx="70" cy="34" r="14" fill="#713F12" />
                <Circle cx="70" cy="34" r="10" fill="#451A03" />
                <Circle cx="67" cy="31" r="2" fill="#A16207" />
              </G>
            ) : (
              <Circle cx="70" cy="38" r="14" fill="#65A30D" />
            )}
          </Svg>
        </View>
      );
  }
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
