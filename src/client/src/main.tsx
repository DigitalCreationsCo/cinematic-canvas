import { createRoot } from "react-dom/client";
import App from "./App.js";
import "./index.css";

document.addEventListener("contextmenu", (e) => e.preventDefault());

createRoot(document.getElementById("root")!).render(<App />);
