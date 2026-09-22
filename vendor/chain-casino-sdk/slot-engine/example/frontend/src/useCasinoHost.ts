import { useEffect, useState } from 'react';
import {
  connectGameToHost,
  type GuestBridgeConnection,
  type HostApiV1,
  type HostSnapshotV1,
  observeGameContentSize,
} from '@chain/casino-sdk/guest';

type SnapshotListener = (snapshot: HostSnapshotV1 | null) => void;

type HostBridge = {
  connection: GuestBridgeConnection;
  listeners: Set<SnapshotListener>;
  latest: HostSnapshotV1 | null;
};

let bridge: HostBridge | undefined;

/** One connection per page: the host binds to the first handshake, so a remount must reuse it. */
function hostBridge(): HostBridge {
  if (bridge) return bridge;
  const listeners = new Set<SnapshotListener>();
  const created: HostBridge = {
    listeners,
    latest: null,
    connection: connectGameToHost({
      async setState(snapshot) {
        created.latest = snapshot;
        listeners.forEach(listener => listener(snapshot));
      },
    }),
  };
  bridge = created;
  return created;
}

export function useCasinoHost() {
  const [hostApi, setHostApi] = useState<HostApiV1 | null>(null);
  const [snapshot, setSnapshot] = useState<HostSnapshotV1 | null>(null);

  useEffect(function subscribeToHost() {
    const { connection, listeners, latest } = hostBridge();
    let mounted = true;
    listeners.add(setSnapshot);
    setSnapshot(latest);
    void connection.promise
      .then(parent => {
        if (mounted) setHostApi(parent);
      })
      .catch(() => {});
    return function unsubscribeFromHost() {
      mounted = false;
      listeners.delete(setSnapshot);
    };
  }, []);

  useEffect(
    function reportContentSize() {
      if (!hostApi) return;
      const observer = observeGameContentSize(hostApi);
      return () => observer.disconnect();
    },
    [hostApi],
  );

  return { hostApi, snapshot };
}
