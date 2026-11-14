type IconProps = { name: "patient" | "hub" | "clinic" | "hospital" | "second" | "app" };

export function Icon({ name }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {name === "patient" ? (
        <>
          <circle cx="12" cy="8" r="3.6" />
          <path d="M5 20c0-4 3-6.6 7-6.6s7 2.6 7 6.6" />
        </>
      ) : null}
      {name === "hub" ? (
        <>
          <path d="M5.5 10a7 7 0 0 1 12-3.2" />
          <path d="M18.5 14a7 7 0 0 1-12 3.2" />
          <path d="M17.5 3.5v3.6h-3.6" />
          <path d="M6.5 20.5v-3.6h3.6" />
        </>
      ) : null}
      {name === "clinic" ? (
        <>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M12 8v8M8 12h8" />
        </>
      ) : null}
      {name === "hospital" ? (
        <>
          <path d="M4 21V8.5l8-4.5 8 4.5V21" />
          <path d="M9.5 21v-5h5v5M12 9v4M10 11h4" />
        </>
      ) : null}
      {name === "second" ? (
        <>
          <path d="M4 5h10v7H8l-3 3v-3H4z" />
          <path d="M16 9h4v8h-1v3l-3-3h-5v-2" />
        </>
      ) : null}
      {name === "app" ? (
        <>
          <rect x="7" y="3" width="10" height="18" rx="2" />
          <path d="M11 18h2" />
        </>
      ) : null}
    </svg>
  );
}

export function Arrow({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

export const ARROW_RIGHT = "M4 12h15M13 6l6 6-6 6";
export const ARROW_DOWN = "M12 4v15M6 13l6 6 6-6";
export const ARROW_UP = "M12 20V5M6 11l6-6 6 6";
