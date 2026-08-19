import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import App from "./App";
import "./styles.css";
import { initTelegram } from "./lib/telegram";
import { initAccent } from "./lib/useAccent";
import { getLang } from "./lib/i18n";
import { registerPWA } from "./lib/registerPWA";

initTelegram();
initAccent();
if (typeof document !== "undefined") document.documentElement.lang = getLang();
registerPWA();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 24 * 60 * 60_000, // 24h — needed for persister
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
});

const persister = createSyncStoragePersister({
  storage: typeof window !== "undefined" ? window.localStorage : undefined,
  key: "cryptotime-query-cache-v1",
  throttleTime: 1000,
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 24 * 60 * 60_000, buster: "v1" }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PersistQueryClientProvider>
  </React.StrictMode>,
);
