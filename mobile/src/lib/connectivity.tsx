import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

type ConnState = {
  /** True when the device thinks it can reach the internet. Note NetInfo's
   *  `isInternetReachable` can be null before the first probe — we treat
   *  that as "online" to avoid flashing an offline banner on cold start. */
  online: boolean;
  /** Raw state, mostly for debugging. */
  raw: NetInfoState | null;
};

const ConnectivityContext = createContext<ConnState>({ online: true, raw: null });

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NetInfoState | null>(null);

  useEffect(() => {
    let mounted = true;
    NetInfo.fetch().then((s) => {
      if (mounted) setState(s);
    });
    const unsub = NetInfo.addEventListener((s) => {
      if (mounted) setState(s);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const value = useMemo<ConnState>(() => {
    if (!state) return { online: true, raw: null };
    const reachable = state.isInternetReachable;
    const online = state.isConnected === true && reachable !== false;
    return { online, raw: state };
  }, [state]);

  return (
    <ConnectivityContext.Provider value={value}>
      {children}
    </ConnectivityContext.Provider>
  );
}

export function useConnectivity(): ConnState {
  return useContext(ConnectivityContext);
}
