// src/hooks/useBoutState.ts
import { useEffect, useState } from "react";
import {
  getBoutState,
  initializeBoutState,
  updateBoutState,
  subscribeToBoutState,
} from "@/lib/supabase";

interface BoutState {
  id: string;
  bout_id: string;
  current_round: number;
  round_start_time: string | null;
  phase: "lobby" | "round_live" | "round_submitted" | "round_locked" | "bout_complete";
  connected_officials: Record<string, any>;
  ready_status: Record<string, boolean>;
}

export function useBoutState(boutId: string) {
  const [state, setState] = useState<BoutState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadState() {
      setLoading(true);
      const { data, error: loadError } = await getBoutState(boutId);

      if (loadError && loadError.code !== "PGRST116") {
        // PGRST116 = "not found", which is fine for new bouts
        setError(loadError.message);
      }

      // Initialize if it doesn't exist
      if (!data) {
        const { data: newState, error: initError } =
          await initializeBoutState(boutId);
        if (initError) {
          setError(initError.message);
        } else {
          setState(newState || null);
        }
      } else {
        setState(data);
      }

      setLoading(false);
    }

    loadState();

    // Subscribe to real-time updates
    const unsubscribe = subscribeToBoutState(boutId, (newState) => {
      setState(newState);
    });

    return unsubscribe;
  }, [boutId]);

  const updateState = async (updates: Partial<BoutState>) => {
    const { error } = await updateBoutState(boutId, updates);
    if (error) {
      setError(error.message);
      return false;
    }
    return true;
  };

  const connectOfficial = async (role: string, name: string, deviceId: string) => {
    const newConnections = {
      ...state?.connected_officials,
      [role]: { name, device_id: deviceId, at: new Date().toISOString() },
    };
    return updateState({ connected_officials: newConnections });
  };

  const disconnectOfficial = async (role: string) => {
    const newConnections = { ...state?.connected_officials };
    delete newConnections[role];
    return updateState({ connected_officials: newConnections });
  };

  const setReady = async (role: string, ready: boolean) => {
    const newReady = {
      ...state?.ready_status,
      [role]: ready,
    };
    return updateState({ ready_status: newReady });
  };

  const startRound = async (roundNumber: number) => {
    return updateState({
      current_round: roundNumber,
      round_start_time: new Date().toISOString(),
      phase: "round_live",
    });
  };

  const completeRound = async () => {
    return updateState({ phase: "round_submitted" });
  };

  const completeBout = async () => {
    return updateState({ phase: "bout_complete" });
  };

  return {
    state,
    loading,
    error,
    updateState,
    connectOfficial,
    disconnectOfficial,
    setReady,
    startRound,
    completeRound,
    completeBout,
  };
}
