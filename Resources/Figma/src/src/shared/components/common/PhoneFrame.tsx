import React from 'react';
import { StatusBar } from './StatusBar';
import { BottomNav } from './BottomNav';
import { ToastHost } from './ToastHost';

type PhoneFrameProps = {
  children: React.ReactNode;
  showNav: boolean;
  heroStatusBar?: boolean;
};

/** Device frame for the web prototype. In React Native this becomes SafeAreaProvider + Tabs. */
export function PhoneFrame({ children, showNav, heroStatusBar }: PhoneFrameProps) {
  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-bg sm:h-[864px] sm:w-[410px] sm:rounded-[56px] sm:border-[10px] sm:border-[#0b0c0a] sm:shadow-[0_40px_80px_-30px_rgba(0,0,0,0.45)]">
      <div className="absolute inset-0 overflow-hidden">{children}</div>
      <StatusBar tone={heroStatusBar ? 'hero' : 'default'} />
      {showNav && <BottomNav />}
      <ToastHost raised={showNav} />
      <div id="overlay-root" className="pointer-events-none absolute inset-0 z-50 [&>*]:pointer-events-auto" />
    </div>);

}