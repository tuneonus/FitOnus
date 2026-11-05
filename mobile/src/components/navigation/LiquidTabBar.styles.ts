import { StyleSheet, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');
// Simple scaling function based on standard ~375 width screen
const scale = (size: number) => (width / 375) * size;
const moderateScale = (size: number, factor = 0.5) => size + (scale(size) - size) * factor;

export const PILL_HEIGHT = 68;
export const FAB_SIZE = 54;
export const ICON_SIZE = 24;

export const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
  },
  innerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  barWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    textAlign: 'center',
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    marginTop: 2,
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    height: ICON_SIZE,
    width: ICON_SIZE,
  },
  fabWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabOuter: {
    position: 'absolute',
    bottom: 25,
    alignItems: 'center',
    justifyContent: 'center',
    width: 100,
    height: 100,
  },
  fabButton: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fabText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    textAlign: 'center',
  },
});
