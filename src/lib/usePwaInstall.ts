import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const STORAGE_KEY = 'vectuno_pwa_installed';

export type DevicePlatform = 'ios' | 'mac' | 'android' | 'desktop';

export function getDevicePlatform(): DevicePlatform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  if (/macintosh|mac os x/.test(ua) && !/chrome|crios/.test(ua) && /safari/.test(ua)) {
    return 'mac';
  }
  return 'desktop';
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Is currently running in standalone PWA window
  const [isStandalone] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  });

  // Has the user already installed/downloaded it to their device
  const [isAppDownloaded, setIsAppDownloaded] = useState(() => {
    if (typeof window === 'undefined') return false;
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return true;
    return localStorage.getItem(STORAGE_KEY) === 'true';
  });

  useEffect(() => {
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    ) {
      localStorage.setItem(STORAGE_KEY, 'true');
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsAppDownloaded(true);
      localStorage.setItem(STORAGE_KEY, 'true');
      setDeferredPrompt(null);
      setShowModal(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // If browser supports checking related installed apps
    if ('getInstalledRelatedApps' in navigator) {
      (navigator as unknown as { getInstalledRelatedApps: () => Promise<unknown[]> })
        .getInstalledRelatedApps()
        .then((apps) => {
          if (apps && apps.length > 0) {
            setIsAppDownloaded(true);
            localStorage.setItem(STORAGE_KEY, 'true');
          }
        })
        .catch(() => {});
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handlePwaAction = useCallback(async () => {
    if (isAppDownloaded) {
      // User already installed the PWA before, but is currently in a browser tab
      setShowModal(true);
      return;
    }

    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsAppDownloaded(true);
        localStorage.setItem(STORAGE_KEY, 'true');
        setDeferredPrompt(null);
      }
      return;
    }

    // No native prompt available (Safari, iOS, or dismissed) -> show instructions modal
    setShowModal(true);
  }, [deferredPrompt, isAppDownloaded]);

  const closeModal = useCallback(() => {
    setShowModal(false);
  }, []);

  return {
    isStandalone,
    isAppDownloaded,
    hasNativePrompt: Boolean(deferredPrompt),
    showModal,
    handlePwaAction,
    closeModal,
    platform: getDevicePlatform(),
  };
}
