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

  // Custom Photo Wallpaper with Frosted Blur & Dimming Overlay
  if (bgArtStyle === 'custom-photo' && bgCustomImage) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        {/* Layer 1: Ambient Full Background (Always covers entire screen with blur to avoid empty borders) */}
        <ImageBackground
          source={{ uri: bgCustomImage }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
          blurRadius={Platform.OS === 'ios' ? Math.max(bgBlurRadius, 16) : Math.max(bgBlurRadius * 0.7, 12)}
        >
          <View
            style={[
              StyleSheet.absoluteFillObject,
              {
                backgroundColor: theme.bg,
                opacity: Math.min(bgDimmingOpacity + 0.15, 0.9),
              },
            ]}
          />
        </ImageBackground>

        {/* Layer 2: Main Photo Wallpaper (Cover or Uncropped Full Contain Mode) */}
        {bgFitMode === 'contain' ? (
          <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center' }]} pointerEvents="none">
            <ImageBackground
              source={{ uri: bgCustomImage }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="contain"
              blurRadius={Platform.OS === 'ios' ? bgBlurRadius * 0.4 : bgBlurRadius * 0.3}
            >
              <View
                style={[
                  StyleSheet.absoluteFillObject,
                  {
                    backgroundColor: theme.bg,
                    opacity: bgDimmingOpacity * 0.6,
                  },
                ]}
              />
            </ImageBackground>
          </View>
        ) : (
          <ImageBackground
            source={{ uri: bgCustomImage }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
            blurRadius={Platform.OS === 'ios' ? bgBlurRadius : bgBlurRadius * 0.7}
          >
            <View
              style={[
                StyleSheet.absoluteFillObject,
                {
                  backgroundColor: theme.bg,
                  opacity: bgDimmingOpacity,
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
      {/* 1. Aurora Ribbon Mesh Style (Curved Glowing Ribbons) */}
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
                <Stop offset="0%" stopColor={primaryColor} stopOpacity={isLightMode ? '0.45' : '0.60'} />
                <Stop offset="50%" stopColor={accentColor} stopOpacity={isLightMode ? '0.25' : '0.40'} />
                <Stop offset="100%" stopColor={theme.bg} stopOpacity="0" />
              </SvgGradient>

              <SvgGradient id="ribbonGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
                <Stop offset="0%" stopColor={accentColor} stopOpacity={isLightMode ? '0.40' : '0.55'} />
                <Stop offset="60%" stopColor={primaryColor} stopOpacity={isLightMode ? '0.20' : '0.30'} />
                <Stop offset="100%" stopColor={theme.bg} stopOpacity="0" />
              </SvgGradient>

              <SvgGradient id="glowCircleGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor={primaryColor} stopOpacity={isLightMode ? '0.40' : '0.50'} />
                <Stop offset="100%" stopColor={theme.bg} stopOpacity="0" />
              </SvgGradient>

              <SvgGradient id="glowCircleGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor={accentColor} stopOpacity={isLightMode ? '0.35' : '0.45'} />
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
                <Stop offset="0%" stopColor={accentColor} stopOpacity={isLightMode ? '0.45' : '0.55'} />
                <Stop offset="100%" stopColor={primaryColor} stopOpacity="0.05" />
              </SvgGradient>
            </Defs>

            {/* Multi-layered flowing stroke contours */}
            <Path
              d="M -20 120 C 120 40 280 220 430 140"
              stroke={accentColor}
              strokeWidth="2.5"
              strokeOpacity={isLightMode ? 0.6 : 0.7}
              fill="none"
            />
            <Path
              d="M -20 160 C 140 80 260 260 430 180"
              stroke={primaryColor}
              strokeWidth="2"
              strokeOpacity={isLightMode ? 0.45 : 0.55}
              fill="none"
            />
            <Path
              d="M -20 520 C 140 680 300 460 430 600"
              stroke={accentColor}
              strokeWidth="2.5"
              strokeOpacity={isLightMode ? 0.55 : 0.65}
              fill="none"
            />
            <Path
              d="M -20 560 C 160 720 280 500 430 640"
              stroke={primaryColor}
              strokeWidth="2"
              strokeOpacity={isLightMode ? 0.4 : 0.5}
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
                <Stop offset="0%" stopColor={primaryColor} stopOpacity={isLightMode ? '0.40' : '0.50'} />
                <Stop offset="100%" stopColor={theme.bg} stopOpacity="0" />
              </SvgGradient>

              <SvgGradient id="geoGrad2" x1="100%" y1="100%" x2="0%" y2="0%">
                <Stop offset="0%" stopColor={accentColor} stopOpacity={isLightMode ? '0.35' : '0.45'} />
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
