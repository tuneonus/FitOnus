import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Route, RouteName, RouteParams, TabKey, tabForRoute, tabRoots } from './routes';

type NavigationState = {
  stack: Route[];
  direction: number;
};

export type NavigationValue = {
  route: Route;
  stack: Route[];
  direction: number;
  canGoBack: boolean;
  isTabRoot: boolean;
  activeTab: TabKey | null;
  navigate: (name: RouteName, params?: RouteParams) => void;
  replace: (name: RouteName, params?: RouteParams) => void;
  goBack: () => void;
  popTo: (name: RouteName) => void;
  reset: (name: RouteName, params?: RouteParams) => void;
  switchTab: (tab: TabKey) => void;
};

const NavigationContext = createContext<NavigationValue | null>(null);

let keyCounter = 0;
const makeRoute = (name: RouteName, params?: RouteParams): Route => {
  const r: Route = {
    key: `${name}-${++keyCounter}`,
    name,
  };
  if (params !== undefined) {
    r.params = params;
  }
  return r;
};

export type NavigationProviderProps = {
  initialRoute?: RouteName;
  initialParams?: RouteParams;
  children: React.ReactNode;
};

export function NavigationProvider({
  initialRoute = 'home',
  initialParams,
  children,
}: NavigationProviderProps) {
  const [state, setState] = useState<NavigationState>(() => ({
    stack: [makeRoute(initialRoute, initialParams)],
    direction: 0,
  }));

  const navigate = useCallback((name: RouteName, params?: RouteParams) => {
    setState((s) => ({ stack: [...s.stack, makeRoute(name, params)], direction: 1 }));
  }, []);

  const replace = useCallback((name: RouteName, params?: RouteParams) => {
    setState((s) => ({
      stack: [...s.stack.slice(0, -1), makeRoute(name, params)],
      direction: 1,
    }));
  }, []);

  const goBack = useCallback(() => {
    setState((s) =>
      s.stack.length > 1 ? { stack: s.stack.slice(0, -1), direction: -1 } : s
    );
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
    setState((s) => {
      const first = s.stack[0];
      if (s.stack.length === 1 && first && first.name === tabRoots[tab]) {
        return s;
      }
      return { stack: [makeRoute(tabRoots[tab])], direction: 0 };
    });
  }, []);

  const value = useMemo<NavigationValue>(() => {
    const currentRoute = state.stack[state.stack.length - 1] ?? makeRoute('home');
    const first = state.stack[0];
    const rootTab = first ? tabForRoute(first.name) : null;
    return {
      route: currentRoute,
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
      switchTab,
    };
  }, [state, navigate, replace, goBack, popTo, reset, switchTab]);

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    return {
      route: { key: 'home-0', name: 'home' },
      stack: [{ key: 'home-0', name: 'home' }],
      direction: 0,
      canGoBack: false,
      isTabRoot: true,
      activeTab: 'home',
      navigate: () => {},
      replace: () => {},
      goBack: () => {},
      popTo: () => {},
      reset: () => {},
      switchTab: () => {},
    };
  }
  return ctx;
}

export function useRouteParams<T extends RouteParams = RouteParams>(): T {
  const ctx = useContext(NavigationContext);
  return (ctx?.route.params ?? {}) as T;
}
