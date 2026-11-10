import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Route, RouteName, RouteParams, TabKey, tabForRoute, tabRoots } from './routes';
import { WEARABLES_ENABLED } from '@/shared/constants/featureFlags';

type NavigationState = {
  stack: Route[];
  direction: number;
  tabStacks: Partial<Record<TabKey, Route[]>>;
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
  const [state, setState] = useState<NavigationState>(() => {
    const initial = makeRoute(initialRoute, initialParams);
    const initialTab = tabForRoute(initialRoute);
    return {
      stack: [initial],
      direction: 0,
      tabStacks: initialTab ? { [initialTab]: [initial] } : {},
    };
  });

  const navigate = useCallback((name: RouteName, params?: RouteParams) => {
    if (!WEARABLES_ENABLED && (name === 'appleWatch' || name === 'wearOs')) {
      return;
    }
    setState((s) => {
      const nextStack = [...s.stack, makeRoute(name, params)];
      const currentTab = s.stack[0] ? tabForRoute(s.stack[0].name) : null;
      const tabStacks = currentTab ? { ...s.tabStacks, [currentTab]: nextStack } : s.tabStacks;
      return { stack: nextStack, direction: 1, tabStacks };
    });
  }, []);

  const replace = useCallback((name: RouteName, params?: RouteParams) => {
    if (!WEARABLES_ENABLED && (name === 'appleWatch' || name === 'wearOs')) {
      return;
    }
    setState((s) => {
      const nextStack = [...s.stack.slice(0, -1), makeRoute(name, params)];
      const currentTab = s.stack[0] ? tabForRoute(s.stack[0].name) : null;
      const tabStacks = currentTab ? { ...s.tabStacks, [currentTab]: nextStack } : s.tabStacks;
      return { stack: nextStack, direction: 1, tabStacks };
    });
  }, []);

  const goBack = useCallback(() => {
    setState((s) => {
      if (s.stack.length <= 1) return s;
      const nextStack = s.stack.slice(0, -1);
      const currentTab = s.stack[0] ? tabForRoute(s.stack[0].name) : null;
      const tabStacks = currentTab ? { ...s.tabStacks, [currentTab]: nextStack } : s.tabStacks;
      return { stack: nextStack, direction: -1, tabStacks };
    });
  }, []);

  const popTo = useCallback((name: RouteName) => {
    setState((s) => {
      const idx = s.stack.map((r) => r.name).lastIndexOf(name);
      const nextStack =
        idx >= 0 ? s.stack.slice(0, idx + 1) : [...s.stack.slice(0, -1), makeRoute(name)];
      const currentTab = s.stack[0] ? tabForRoute(s.stack[0].name) : null;
      const tabStacks = currentTab ? { ...s.tabStacks, [currentTab]: nextStack } : s.tabStacks;
      return { stack: nextStack, direction: -1, tabStacks };
    });
  }, []);

  const reset = useCallback((name: RouteName, params?: RouteParams) => {
    const newRoute = makeRoute(name, params);
    const targetTab = tabForRoute(name);
    setState((s) => {
      const tabStacks = targetTab ? { ...s.tabStacks, [targetTab]: [newRoute] } : s.tabStacks;
      return { stack: [newRoute], direction: 0, tabStacks };
    });
  }, []);

  const switchTab = useCallback((tab: TabKey) => {
    setState((s) => {
      const currentTab = s.stack[0] ? tabForRoute(s.stack[0].name) : null;

      // Reselection of currently active tab:
      if (currentTab === tab) {
        // If deep in the hierarchy, pop back to tab root
        if (s.stack.length > 1 && s.stack[0]) {
          const rootStack: Route[] = [s.stack[0]];
          return {
            stack: rootStack,
            direction: -1,
            tabStacks: { ...s.tabStacks, [tab]: rootStack },
          };
        }
        // Already at root of active tab: prevent duplicate navigation
        return s;
      }

      // Switching to a different tab:
      const updatedTabStacks = { ...s.tabStacks };
      if (currentTab) {
        updatedTabStacks[currentTab] = s.stack;
      }

      const targetStack =
        updatedTabStacks[tab] && updatedTabStacks[tab]!.length > 0
          ? updatedTabStacks[tab]!
          : [makeRoute(tabRoots[tab])];
      updatedTabStacks[tab] = targetStack;

      return {
        stack: targetStack,
        direction: 0,
        tabStacks: updatedTabStacks,
      };
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
