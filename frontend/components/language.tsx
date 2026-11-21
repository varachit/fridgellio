"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import type { Language } from "@/lib/pantry";

type LanguageState = { lang: Language; setLanguage: (lang: Language) => void };
const LanguageStore = createContext<StoreApi<LanguageState> | null>(null);
const storageKey = "fridgellio-language";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() =>
    createStore<LanguageState>((set) => ({
      lang: "en",
      setLanguage: (lang) => set({ lang }),
    })),
  );
  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) === "th")
        store.getState().setLanguage("th");
    } catch {}
    document.documentElement.lang = store.getState().lang;
    return store.subscribe(({ lang }) => {
      document.documentElement.lang = lang;
      try {
        localStorage.setItem(storageKey, lang);
      } catch {}
    });
  }, [store]);
  return (
    <LanguageStore.Provider value={store}>{children}</LanguageStore.Provider>
  );
}

export function useLanguage() {
  const store = useContext(LanguageStore);
  if (!store) throw new Error("LanguageProvider is required");
  return useStore(store);
}
