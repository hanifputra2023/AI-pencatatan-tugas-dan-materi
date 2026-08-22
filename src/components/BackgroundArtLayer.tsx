import React from 'react';
import { View, StyleSheet, ImageBackground, Platform } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop, Circle } from 'react-native-svg';
import { useTheme } from '../contexts/ThemeContext';

interface BackgroundArtLayerProps {
  children?: React.ReactNode;
}

export const BackgroundArtLayer: React.FC<BackgroundArtLayerProps> = ({ children }) => {
  const {
    theme,
    isLightMode,
    bgArtStyle,
    bgCustomImage,
    bgBlurRadius,
    bgDimmingOpacity,
    bgFitMode,
  } = useTheme();

  // Colors derived dynamically from current theme
  const primaryColor = theme.primary || '#2563EB';
  const accentColor = theme.accentLight || theme.accent || '#3B82F6';

  // Custom Photo Wallpaper (Sharp, Clear or user-controlled Frosted Blur)
  if (bgArtStyle === 'custom-photo' && bgCustomImage) {
    const activeBlur = bgBlurRadius ?? 0;
    const activeDimming = bgDimmingOpacity ?? 0.30;

    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        {/* Main Photo Wallpaper */}
        {bgFitMode === 'contain' ? (
          <>
            {/* Ambient Background for Borders */}
            <ImageBackground
              source={{ uri: bgCustomImage }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
              blurRadius={Math.max(activeBlur, 12)}
            >
              <View
                style={[
                  StyleSheet.absoluteFillObject,
                  {
                    backgroundColor: theme.bg,
                    opacity: 0.65,
                  },
                ]}
              />
            </ImageBackground>

            {/* Sharp Contained Image in Center */}
            <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center' }]} pointerEvents="none">
              <ImageBackground
                source={{ uri: bgCustomImage }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="contain"
                blurRadius={activeBlur}
              >
                <View
                  style={[
                    StyleSheet.absoluteFillObject,
                    {
                      backgroundColor: theme.bg,
                      opacity: activeDimming,
                    },
                  ]}
                />
              </ImageBackground>
            </View>
          </>
        ) : (
          <ImageBackground
            source={{ uri: bgCustomImage }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
            blurRadius={activeBlur}
          >
            <View
              style={[
                StyleSheet.absoluteFillObject,
                {
                  backgroundColor: theme.bg,
                  opacity: activeDimming,
                },
              ]}
            />
          </ImageBackground>
        )}

        <View style={styles.contentLayer}>{children}</View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* 1. Aurora Ribbon Mesh Style (Soft Ambient Glowing Ribbons) */}
      {bgArtStyle === 'aurora-ribbons' && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <Svg
            width="100%"
            height="100%"
            viewBox="0 0 400 800"
            preserveAspectRatio="none"
            style={StyleSheet.absoluteFillObject}
          >
            <Defs>
              <SvgGradient id="ribbonGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor={primaryColor} stopOpacity={isLightMode ? '0.14' : '0.22'} />
                <Stop offset="50%" stopColor={accentColor} stopOpacity={isLightMode ? '0.08' : '0.14'} />
                <Stop offset="100%" stopColor={theme.bg} stopOpacity="0" />
              </SvgGradient>

              <SvgGradient id="ribbonGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
                <Stop offset="0%" stopColor={accentColor} stopOpacity={isLightMode ? '0.12' : '0.20'} />
                <Stop offset="60%" stopColor={primaryColor} stopOpacity={isLightMode ? '0.06' : '0.10'} />
                <Stop offset="100%" stopColor={theme.bg} stopOpacity="0" />
              </SvgGradient>

              <SvgGradient id="glowCircleGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor={primaryColor} stopOpacity={isLightMode ? '0.12' : '0.18'} />
                <Stop offset="100%" stopColor={theme.bg} stopOpacity="0" />
              </SvgGradient>

              <SvgGradient id="glowCircleGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor={accentColor} stopOpacity={isLightMode ? '0.10' : '0.15'} />
                <Stop offset="100%" stopColor={theme.bg} stopOpacity="0" />
              </SvgGradient>
            </Defs>

            {/* Glowing Corner Halo Lights */}
            <Circle cx="350" cy="120" r="180" fill="url(#glowCircleGrad1)" />
            <Circle cx="50" cy="680" r="160" fill="url(#glowCircleGrad2)" />

            {/* Top Swirling Aurora Ribbon */}
            <Path
              d="M -50 -30 Q 120 180 300 80 T 480 240 L 480 -50 Z"
              fill="url(#ribbonGrad1)"
            />

            {/* Middle Flowing S-Curve Ribbon */}
            <Path
              d="M -30 320 C 140 240 260 460 430 380 L 430 520 C 240 600 80 440 -30 460 Z"
              fill="url(#ribbonGrad2)"
            />

            {/* Bottom Swirling Wave Ribbon */}
            <Path
              d="M -40 820 Q 160 620 340 730 T 450 650 L 450 850 L -40 850 Z"
              fill="url(#ribbonGrad1)"
            />
          </Svg>
        </View>
      )}

      {/* 2. Fluid Abstract Waves Style (Modern Geometric Flow Lines) */}
      {bgArtStyle === 'fluid-waves' && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <Svg
            width="100%"
            height="100%"
            viewBox="0 0 400 800"
            preserveAspectRatio="none"
            style={StyleSheet.absoluteFillObject}
          >
            <Defs>
              <SvgGradient id="fluidGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor={accentColor} stopOpacity={isLightMode ? '0.15' : '0.20'} />
                <Stop offset="100%" stopColor={primaryColor} stopOpacity="0.02" />
              </SvgGradient>
            </Defs>

            {/* Multi-layered flowing stroke contours */}
            <Path
              d="M -20 120 C 120 40 280 220 430 140"
              stroke={accentColor}
              strokeWidth="2.5"
              strokeOpacity={isLightMode ? 0.22 : 0.30}
              fill="none"
            />
            <Path
              d="M -20 160 C 140 80 260 260 430 180"
              stroke={primaryColor}
              strokeWidth="2"
              strokeOpacity={isLightMode ? 0.16 : 0.22}
              fill="none"
            />
            <Path
              d="M -20 520 C 140 680 300 460 430 600"
              stroke={accentColor}
              strokeWidth="2.5"
              strokeOpacity={isLightMode ? 0.20 : 0.28}
              fill="none"
            />
            <Path
              d="M -20 560 C 160 720 280 500 430 640"
              stroke={primaryColor}
              strokeWidth="2"
              strokeOpacity={isLightMode ? 0.15 : 0.20}
              fill="none"
            />

            {/* Organic Soft Flow Fill */}
            <Path
              d="M -30 600 Q 180 490 430 680 L 430 820 L -30 820 Z"
              fill="url(#fluidGrad1)"
            />
          </Svg>
        </View>
      )}

      {/* 3. Geometric Glow Style (Angular Modern Glows) */}
      {bgArtStyle === 'geometric-glow' && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <Svg
            width="100%"
            height="100%"
            viewBox="0 0 400 800"
            preserveAspectRatio="none"
            style={StyleSheet.absoluteFillObject}
          >
            <Defs>
              <SvgGradient id="geoGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor={primaryColor} stopOpacity={isLightMode ? '0.14' : '0.20'} />
                <Stop offset="100%" stopColor={theme.bg} stopOpacity="0" />
              </SvgGradient>

              <SvgGradient id="geoGrad2" x1="100%" y1="100%" x2="0%" y2="0%">
                <Stop offset="0%" stopColor={accentColor} stopOpacity={isLightMode ? '0.12' : '0.18'} />
                <Stop offset="100%" stopColor={theme.bg} stopOpacity="0" />
              </SvgGradient>
            </Defs>

            {/* Top-Right Diagonal Polygon */}
            <Path
              d="M 160 -30 L 440 -30 L 440 280 L 240 140 Z"
              fill="url(#geoGrad1)"
            />

            {/* Bottom-Left Diagonal Polygon */}
            <Path
              d="M -30 520 L 180 650 L 100 830 L -30 830 Z"
              fill="url(#geoGrad2)"
            />
          </Svg>
        </View>
      )}

      {/* Main Screen Content Layer */}
      <View style={styles.contentLayer}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  contentLayer: {
    flex: 1,
    width: '100%',
    height: '100%',
    zIndex: 1,
    backgroundColor: 'transparent',
  },
});
