import { useEffect, useState } from 'react';

/** Overlay host inside the phone frame. In React Native this maps to <Modal>. */
export function useOverlayRoot() {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setRoot(document.getElementById('overlay-root'));
  }, []);
  return root;
}