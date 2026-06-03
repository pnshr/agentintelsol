import { Orbit } from "lucide-react";

export function Footer() {
  return (
    <footer id="settings" className="border-t border-white/10">
      <div className="mx-auto flex w-[min(1120px,calc(100%-32px))] flex-col gap-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg border border-sky-300/25 bg-sky-300/10 text-sky-100">
            <Orbit className="size-4" aria-hidden="true" />
          </span>
          <div>
            <strong className="block text-sm text-slate-100">Nebula</strong>
            <span className="text-sm text-slate-500">Copyright 2026 Nebula Intelligence.</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-slate-400">
          {["Docs", "Security", "Status", "X", "Discord"].map((item) => (
            <a key={item} href="#" className="transition hover:text-slate-100">
              {item}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
