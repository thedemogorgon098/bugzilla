"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("nt_theme") as "dark" | "light" | null;
    const initial = saved || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    setTheme(initial);
    applyTheme(initial);
  }, []);

  function applyTheme(t: "dark" | "light") {
    const root = document.documentElement;
    if (t === "light") {
      root.classList.remove("dark");
      root.classList.add("light");
      root.setAttribute("data-theme", "light");
    } else {
      root.classList.remove("light");
      root.classList.add("dark");
      root.setAttribute("data-theme", "dark");
    }
    localStorage.setItem("nt_theme", t);
  }

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  if (!mounted) {
    return (
      <div className={`w-9 h-9 rounded-xl p-2 ${className}`} />
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className={`relative rounded-xl p-2 transition-all text-[var(--muted)] hover:text-[var(--text)] hover:bg-white/5 border border-transparent hover:border-[var(--line)] ${className}`}
    >
      {theme === "dark" ? (
        <Sun size={17} className="text-amber-300 transition-transform duration-200 hover:rotate-45" />
      ) : (
        <Moon size={17} className="text-indigo-600 transition-transform duration-200 hover:-rotate-12" />
      )}
    </button>
  );
}
