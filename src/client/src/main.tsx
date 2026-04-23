import { createRoot } from "react-dom/client";
import App from "./App.js";
import "./index.css";
import { trpc, trpcClient, queryClient } from './lib/trpc.js';
import { QueryClientProvider } from '@tanstack/react-query';

document.addEventListener("contextmenu", (e) => e.preventDefault());

createRoot(document.getElementById("root")!).render(
    <QueryClientProvider client={queryClient}>
        <App />
    </QueryClientProvider>
);
