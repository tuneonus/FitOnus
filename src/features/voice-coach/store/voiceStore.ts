import { create } from 'zustand';

type MicPermission = 'unknown' | 'granted' | 'denied';

type VoiceState = {
  micPermission: MicPermission;
  setMicPermission: (p: MicPermission) => void;
};

export const useVoiceStore = create<VoiceState>((set) => ({
  micPermission: 'unknown',
  setMicPermission: (micPermission) => set({ micPermission })
}));