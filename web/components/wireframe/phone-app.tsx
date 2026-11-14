import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderHeart, History, Inbox, Share2 } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./ui";

export const PHONE_TABS = [
  { href: "/patient", label: "Request", icon: Inbox },
  // The preview is the before/after leak scan. "Share with an app" is PulseFit, not this tab.
  { href: "/patient/deid#deid-preview", label: "De-identify", icon: FolderHeart },
  { href: "/patient/history", label: "History", icon: History },
  { href: "/patient/sharing", label: "Sharing", icon: Share2 },
] as const;

function tabPath(href: string): string {
  return href.split("#")[0]?.split("?")[0] ?? href;
}

export function phoneTabOn(pathname: string, href: string): boolean {
  const path = tabPath(href);
  if (path === "/patient") return pathname === "/patient" || pathname === "/patient/consent" || pathname.startsWith("/patient/records");
  if (path === "/patient/deid") return pathname.startsWith("/patient/deid");
  if (path === "/patient/history") return pathname === "/patient/history" || pathname === "/patient/timeline";
  return pathname === path;
}

export function PhoneTabs({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav className={cx("grid grid-cols-4 border-t border-[var(--line)] bg-[var(--card)]", className)} aria-label="Maya">
      {PHONE_TABS.map((tab) => {
        const on = phoneTabOn(pathname, tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={on ? "page" : undefined}
            className={cx(
              "flex flex-col items-center gap-1 px-1 py-2 text-[10px] font-semibold",
              on ? "text-[var(--teal)]" : "text-[var(--muted)]",
            )}
          >
            <Icon size={16} aria-hidden="true" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function PhoneApp({ children, desktop }: { children: ReactNode; desktop?: ReactNode }) {
  const pathname = usePathname();
  return (
    <div>
      <nav className="mb-3.5 hidden gap-5 md:flex" aria-label="Maya">
        {PHONE_TABS.map((tab) => {
          const on = phoneTabOn(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={on ? "page" : undefined}
              className={cx(
                "flex h-11 items-center text-[15.5px] shadow-[inset_0_-2px_0_transparent]",
                on ? "font-semibold text-[var(--ink)] shadow-[inset_0_-2px_0_var(--teal)]" : "font-medium text-[var(--muted)]",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {desktop ? <div className="mb-6 hidden md:block">{desktop}</div> : null}
      <div className="mx-auto w-full max-w-[390px] md:mx-0 md:max-w-none">{children}</div>
    </div>
  );
}
