import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import AuthScreen from './AuthScreen';
import Onboarding from './Onboarding';
import NewPassword from './NewPassword';
import { loadAccount, onAuthChange, signOut, type Account } from '../../lib/account';
import { socialEnabled } from '../../lib/social';

interface Ctx {
  account: Account | null;
  setAccount: (a: Account) => void;
  logout: () => Promise<void>;
}
const AccountCtx = createContext<Ctx>({ account: null, setAccount: () => {}, logout: async () => {} });
export const useAccount = () => useContext(AccountCtx);

type Stage = 'loading' | 'auth' | 'onboarding' | 'recovery' | 'ready' | 'offline';

/**
 * Abans de res, cal un compte: correu + contrasenya i el perfil de motorista.
 * A la demo (sense servidor) l'app s'obre directament.
 */
export default function AccountGate({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<Stage>(socialEnabled ? 'loading' : 'ready');
  const [account, setAccountState] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((a: Account | null) => {
    setAccountState(a);
    setStage(!a ? 'auth' : a.profile?.onboarded ? 'ready' : 'onboarding');
  }, []);

  const refresh = useCallback(() => {
    setError(null);
    loadAccount().then(apply).catch((e) => {
      setError((e as Error).message);
      setStage('offline');
    });
  }, [apply]);

  useEffect(() => {
    if (!socialEnabled) return;
    refresh();
    return onAuthChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setStage('recovery');
      else if (event === 'SIGNED_OUT') apply(null);
      else if (event === 'SIGNED_IN' && location.hash.includes('access_token')) {
        history.replaceState(null, '', location.pathname + location.search);
        refresh();
      }
    });
  }, [refresh, apply]);

  const logout = useCallback(async () => {
    await signOut();
    apply(null);
  }, [apply]);

  const ctx: Ctx = { account, setAccount: apply, logout };

  if (stage === 'loading') {
    return (
      <div className="auth-page">
        <div className="auth-card"><div className="auth-logo">M</div><p className="hint" style={{ textAlign: 'center' }}>Carregant…</p></div>
      </div>
    );
  }
  if (stage === 'offline') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">M</div>
          <div className="alert warn">{error ?? 'No hi ha connexió.'}</div>
          <button className="btn primary" style={{ width: '100%' }} onClick={refresh}>Torna-ho a provar</button>
        </div>
      </div>
    );
  }
  if (stage === 'auth') return <AuthScreen onDone={apply} />;
  if (stage === 'recovery') return <NewPassword onDone={refresh} />;
  if (stage === 'onboarding' && account) {
    return (
      <div className="auth-page">
        <div className="auth-card wide">
          <Onboarding account={account} onDone={apply} onLogout={logout} />
        </div>
      </div>
    );
  }
  return <AccountCtx.Provider value={ctx}>{children}</AccountCtx.Provider>;
}
