import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Route, RouteName, RouteParams, TabKey, tabForRoute, tabRoots } from './routes';

type NavigationState = {stack: Route[];direction: number;};

type NavigationValue = {
  route: Route;
  stack: Route[];
  direction: number;
  canGoBack: boolean;
  isTabRoot: boolean;
  activeTab: TabKey | null;
  navigate: (name: RouteName, params?: RouteParams) => void;
  replace: (name: RouteName, params?: RouteParams) => void;
  goBack: () => void;
  /** Pop back to the nearest route with this name (or replace current if absent). */
  popTo: (name: RouteName) => void;
  reset: (name: RouteName, params?: RouteParams) => void;
  switchTab: (tab: TabKey) => void;
};

const NavigationContext = createContext<NavigationValue | null>(null);

let keyCounter = 0;
const makeRoute = (name: RouteName, params?: RouteParams): Route => ({
  key: `${name}-${++keyCounter}`,
  name,
  params
});

type NavigationProviderProps = {
  initialRoute: RouteName;
  initialParams?: RouteParams;
  children: React.ReactNode;
};

export function NavigationProvider({ initialRoute, initialParams, children }: NavigationProviderProps) {
  const [state, setState] = useState<NavigationState>(() => ({
    stack: [makeRoute(initialRoute, initialParams)],
    direction: 0
  }));

  const navigate = useCallback((name: RouteName, params?: RouteParams) => {
    setState((s) => ({ stack: [...s.stack, makeRoute(name, params)], direction: 1 }));
  }, []);

  const replace = useCallback((name: RouteName, params?: RouteParams) => {
    setState((s) => ({ stack: [...s.stack.slice(0, -1), makeRoute(name, params)], direction: 1 }));
  }, []);

  const goBack = useCallback(() => {
    setState((s) => s.stack.length > 1 ? { stack: s.stack.slice(0, -1), direction: -1 } : s);
  }, []);

  const popTo = useCallback((name: RouteName) => {
    setState((s) => {
      const idx = s.stack.map((r) => r.name).lastIndexOf(name);
      if (idx >= 0) return { stack: s.stack.slice(0, idx + 1), direction: -1 };
      return { stack: [...s.stack.slice(0, -1), makeRoute(name)], direction: -1 };
    });
  }, []);

  const reset = useCallback((name: RouteName, params?: RouteParams) => {
    setState({ stack: [makeRoute(name, params)], direction: 0 });
  }, []);

  const switchTab = useCallback((tab: TabKey) => {
    setState((s) =>
    s.stack.length === 1 && s.stack[0].name === tabRoots[tab] ?
    s :
    { stack: [makeRoute(tabRoots[tab])], direction: 0 }
    );
  }, []);

  const value = useMemo<NavigationValue>(() => {
    const route = state.stack[state.stack.length - 1];
    const rootTab = tabForRoute(state.stack[0].name);
    return {
      route,
      stack: state.stack,
      direction: state.direction,
      canGoBack: state.stack.length > 1,
      isTabRoot: state.stack.length === 1 && rootTab !== null,
      activeTab: rootTab,
      navigate,
      replace,
      goBack,
      popTo,
      reset,
      switchTab
    };
  }, [state, navigate, replace, goBack, popTo, reset, switchTab]);

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used inside NavigationProvider');
  return ctx;
}

export function useRouteParams() {
  return useNavigation().route.params ?? {};
}