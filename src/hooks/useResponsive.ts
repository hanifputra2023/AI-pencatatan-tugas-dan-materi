import { useWindowDimensions } from 'react-native';

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const isTablet = width >= 768 && width < 1024;
  const isMobile = width < 768;

  return {
    width,
    height,
    isDesktop,
    isTablet,
    isMobile,
    maxContentWidth: isDesktop ? 960 : isTablet ? 700 : '100%',
  };
}
