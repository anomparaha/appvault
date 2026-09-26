import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  initDb,
  hasMasterPassword,
  saveMasterPassword,
  hasPin as checkDbHasPin,
  resetEntireVault,
} from '../../lib/db/db';
import {
  createVerificationToken,
} from '../../lib/crypto/crypto';
import { logActivity } from '../../lib/services/activity';
import type { ToastType } from '../types/toast';

export type Screen = 'loading' | 'setup' | 'unlock' | 'app' | 'error';

interface UseAuthVaultProps {
  toast: (text: string, type?: ToastType) => void;
  loadWallets?: (sessionToken?: string) => Promise<any>;
}

export function useAuthVault({ toast, loadWallets }: UseAuthVaultProps) {
  const [screen, setScreen] = useState<Screen>('loading');
  const [sessionToken, setSessionToken] = useState<string>('');
  const [hasPin, setHasPin] = useState(false);
  const [initError, setInitError] = useState('');
  const [autoLockMinutes, setAutoLockMinutes] = useState<number>(() => {
    const saved = localStorage.getItem('plurivex_autolock');
    return saved ? Math.max(1, parseInt(saved, 10)) : 15;
  });

  const lastActivityRef = useRef<number>(Date.now());

  // 1. Initialize SQLite Database & Check Vault status
  const checkVaultStatus = useCallback(async () => {
    try {
      await initDb();
      const hasPw = await hasMasterPassword();
      const pinConfigured = await checkDbHasPin();
      setHasPin(pinConfigured);
      setScreen(hasPw ? 'unlock' : 'setup');
    } catch (err: any) {
      console.error('Database initialization failed:', err);
      setInitError(err?.message || String(err));
      setScreen('error');
    }
  }, []);

  useEffect(() => {
    checkVaultStatus();
  }, [checkVaultStatus]);

  // 2. Auto-Lock Timer & Inactivity Listener
  const lock = useCallback(() => {
    setSessionToken('');
    setScreen('unlock');
    invoke('vault_session_lock').catch(() => {});
    invoke('clear_recovery_session', { sessionId: '' }).catch(() => {});
    logActivity({
      type: "security",
      title: "Vault Session Locked",
      desc: "Active session token cleared & memory zeroized",
      amount: "Locked",
      amountColor: "var(--warning)",
      status: "info",
    });
    toast('Vault locked for security', 'info');
  }, [toast]);

  useEffect(() => {
    localStorage.setItem('plurivex_autolock', String(autoLockMinutes));
  }, [autoLockMinutes]);

  useEffect(() => {
    if (screen !== 'app' || autoLockMinutes <= 0) return;

    const handleActivity = () => {
      lastActivityRef.current = Date.now();
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('mousedown', handleActivity);
    window.addEventListener('touchstart', handleActivity);

    const interval = setInterval(() => {
      const elapsedMinutes = (Date.now() - lastActivityRef.current) / 60000;
      if (elapsedMinutes >= autoLockMinutes) {
        lock();
      }
    }, 15000);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      clearInterval(interval);
    };
  }, [screen, autoLockMinutes, lock]);

  // 3. Password & PIN Setup Handlers
  const setupPassword = async (pw: string, pin?: string) => {
    const token = await createVerificationToken(pw);
    await saveMasterPassword(token);

    const sToken = await invoke<string>('vault_session_unlock', {
      password: pw,
      timeoutSeconds: autoLockMinutes * 60,
    });
    setSessionToken(sToken);

    if (pin && pin.trim().length >= 4) {
      await invoke('vault_setup_pin_scoped', {
        sessionToken: sToken,
        pin: pin.trim(),
      });
      setHasPin(true);
    }

    if (loadWallets) await loadWallets(sToken);
    setScreen('app');
    logActivity({
      type: "security",
      title: "Master Vault Created",
      desc: "Argon2id cryptographic salt and key derivation configured",
      amount: "Protected",
      amountColor: "var(--ok)",
      status: "success",
    });
    toast('Vault successfully created & encrypted!', 'success');
  };

  // 4. Unlock with Master Password (100% Native Rust execution - verification token never touches JS)
  const unlock = async (pw: string): Promise<boolean> => {
    try {
      const sToken = await invoke<string>('vault_session_unlock', {
        password: pw,
        timeoutSeconds: autoLockMinutes * 60,
      });
      setSessionToken(sToken);
      if (loadWallets) await loadWallets(sToken);
      setScreen('app');
      logActivity({
        type: "security",
        title: "Vault Session Unlocked",
        desc: "Authenticated via master password with native memory verification",
        amount: "Unlocked",
        amountColor: "var(--ok)",
        status: "success",
      });
      toast('Vault successfully unlocked!', 'success');
      return true;
    } catch (err: any) {
      console.warn('Session unlock failed:', err);
      const msg = String(err);
      toast(
        msg.includes('Invalid master password')
          ? 'Incorrect master password'
          : 'Failed to initialize vault session',
        'error'
      );
      return false;
    }
  };

  // 5. Unlock with Quick PIN (100% Native Rust execution - master password never touches JS V8)
  const unlockWithPin = async (pin: string): Promise<boolean> => {
    try {
      const sToken = await invoke<string>('vault_session_unlock_with_pin', {
        pin: pin.trim(),
        timeoutSeconds: autoLockMinutes * 60,
      });
      setSessionToken(sToken);
      if (loadWallets) await loadWallets(sToken);
      setScreen('app');
      logActivity({
        type: "security",
        title: "Vault Unlocked (Quick PIN)",
        desc: "Authenticated via hardware-isolated 4-digit PIN",
        amount: "Unlocked",
        amountColor: "var(--ok)",
        status: "success",
      });
      toast('Vault unlocked with PIN!', 'success');
      return true;
    } catch (err) {
      console.warn('PIN unlock failed:', err);
      toast('Incorrect PIN entered', 'error');
      return false;
    }
  };

  // 6. Reset Entire Vault (Forgot Password Flow)
  const resetVault = async (confirmation: string) => {
    await resetEntireVault(confirmation, sessionToken);
    await invoke('vault_session_lock').catch(() => {});
    setSessionToken('');
    setHasPin(false);
    if (loadWallets) await loadWallets();
    setScreen('setup');
    toast('Vault reset complete. Set up a new password.', 'info');
  };

  // 7. Scoped Secret Reveal (Only on Explicit User Request)
  const revealSecret = async (id: number): Promise<string | null> => {
    if (!sessionToken) return null;
    try {
      return await invoke<string>('vault_reveal_secret_scoped', {
        walletId: id,
        sessionToken,
      });
    } catch (err) {
      console.error('Reveal secret error:', err);
      toast('Failed to decrypt secret with password', 'error');
      return null;
    }
  };

  return {
    screen,
    setScreen,
    sessionToken,
    setSessionToken,
    hasPin,
    initError,
    setInitError,
    autoLockMinutes,
    setAutoLockMinutes,
    lock,
    unlock,
    unlockWithPin,
    setupPassword,
    resetVault,
    revealSecret,
  };
}
