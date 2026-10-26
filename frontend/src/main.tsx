import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// No StrictMode: its double-mount races with drei <Html> labels in the 3D scene.
createRoot(document.getElementById("root")!).render(<App />);
