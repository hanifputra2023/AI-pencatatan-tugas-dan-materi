import { useWindowDimensions } from 'react-native';

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const isTablet = width >= 768 && width < 1024;
  const isMobile = width < 768;
  const isSmallPhone = width < 380; // iPhone SE, Galaxy A0x, screen width <= 375px
  const isLargePhone = width >= 380 && width < 768; // iPhone Pro Max / Plus / Fold

  // Proportional fluid scaler based on standard 390px mobile reference
  const scale = Math.min(Math.max(width / 390, 0.85), 1.25);

  return {
    width,
    height,
    isDesktop,
    isTablet,
    isMobile,
    isSmallPhone,
    isLargePhone,
    scale,
    maxContentWidth: isDesktop ? 960 : isTablet ? 720 : '100%',
    horizontalPadding: isSmallPhone ? 12 : isDesktop ? 32 : 16,
  };
}
