import { useLocation } from "react-router-dom";
import { Sun, Moon } from "lucide-react";
import { useSettingsStore } from "@/stores/useSettingsStore";

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/forecast": "Forecast Explorer",
  "/simulate": "Simulation Sandbox",
  "/analytics": "Usage Analytics",
  "/actions": "Recommendations & Actions",
  "/settings": "Settings",
};

export default function TopBar() {
  const location = useLocation();
  const { theme, toggleTheme } = useSettingsStore();
  const title = pageTitles[location.pathname] ?? "Energy IDSS";

  return (
    <header className="flex items-center justify-between h-14 px-6 bg-card border-b border-border">
      <h1 className="text-section-heading text-foreground">{title}</h1>

      <div className="flex items-center gap-2">
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? (
            <Sun className="w-5 h-5" />
          ) : (
            <Moon className="w-5 h-5" />
          )}
        </button>
      </div>
    </header>
  );
}
