import React, { createContext, useContext, useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

interface OfflineContextValue {
  isOffline: boolean;
}

const OfflineContext = createContext<OfflineContextValue>({ isOffline: false });

export const useOffline = () => useContext(OfflineContext);

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [isOffline, setIsOffline] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // isConnected can be null while NetInfo is still determining status,
      // so only flip to "offline" once we get a definite false.
      setIsOffline(state.isConnected === false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <OfflineContext.Provider value={{ isOffline }}>
      {children}
    </OfflineContext.Provider>
  );
}
