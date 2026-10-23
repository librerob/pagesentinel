export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    plus: "M12 5v14M5 12h14",
    monitor: "M4 4h16v12H4zM8 20h8M12 16v4",
    changes: "M4 7h12l-3-3M20 17H8l3 3M16 7l-3 3M8 17l3-3",
    policy: "M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16h6",
    settings:
      "M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
    arrow: "m9 5 7 7-7 7",
    back: "m14 5-7 7 7 7",
    check: "m5 12 4 4L19 6",
    pause: "M8 5v14M16 5v14",
    refresh:
      "M20 6v5h-5M4 18v-5h5M19 10a7 7 0 0 0-12-5L4 8M5 14a7 7 0 0 0 12 5l3-3",
    select: "m5 3 14 9-7 1-3 7z",
    open: "M14 3h7v7M21 3l-10 10M10 5H3v16h16v-7",
    search: "M21 21l-6-6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
    info: "M12 11v6M12 7h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
    close: "m6 6 12 12M6 18 18 6",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.info} />
    </svg>
  );
}
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect x="2" y="2" width="44" height="44" rx="13" fill="var(--primary)" />
      <path
        d="M14 15h20M14 24h9M14 33h20"
        fill="none"
        stroke="var(--on-primary)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="32" cy="24" r="4" fill="var(--on-primary)" />
    </svg>
  );
}
