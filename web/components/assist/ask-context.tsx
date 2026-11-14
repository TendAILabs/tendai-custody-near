"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type AskState = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const AskContext = createContext<AskState | null>(null);

export function AskProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <AskContext.Provider value={{ open, setOpen }}>{children}</AskContext.Provider>;
}

export function useAsk(): AskState {
  const value = useContext(AskContext);
  if (!value) throw new Error("Ask TendAI is not available.");
  return value;
}
