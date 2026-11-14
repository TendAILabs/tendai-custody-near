"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { AskLaunch } from "@/components/assist/ask-launch";
import { plexMono, plexSans } from "@/components/landing/fonts";
import { GUIDE_STEPS, guideCurrent } from "@/lib/guide";
import { workspaceForPath, youAre, type ClinicianOrg, type WorkspaceId } from "@/lib/nav/model";
import type { Story } from "@/lib/story";
import { useStory } from "@/lib/story-context";
import { clearSetup, useAccountReady } from "@/lib/visitor/use-account";
import { Btn } from "./c2";
import { GuideTour } from "./guide-tour";
import { IntroModal, introSeen, setGuided } from "./intro-modal";
import { HelpMenu } from "./nav/help-menu";
import { MobileDrawer } from "./nav/mobile-drawer";
import { NavList } from "./nav/menu";
import { NotificationsBell } from "./nav/notifications";
import { ping, subscribe } from "./nav/bus";
import { OrgPicker } from "./nav/org-picker";
import { RoleTabs } from "./nav/role-tabs";
import { StatusChip } from "./nav/status-chip";
import { Stepper } from "./stepper";
import "./dashboard.css";

function isWorkspace(value: string | null): value is WorkspaceId {
  return value === "patient" || value === "clinician" || value === "admin" || value === "proof";
}

function isOrg(value: string | null): value is ClinicianOrg {
  return value === "clinic" || value === "hospital" || value === "reyes";
}

function queryString(params: { toString(): string }): string {
  const value = params.toString();
  return value ? `?${value}` : "";
}

type ChromeShared = {
  pathname: string;
  hash: string;
  state: Story;
  guided: boolean;
  drawer: boolean;
  storedWorkspace: string | null;
  storedOrg: string | null;
  onToggleDrawer: () => void;
  onCloseDrawer: () => void;
  onGuide: () => void;
  onReset: () => void;
};

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/" || pathname === "/landing" || pathname === "/docs") return children;
  return <Dashboard pathname={pathname}>{children}</Dashboard>;
}

function Dashboard({ pathname, children }: { pathname: string; children: ReactNode }) {
  const { reset, ready, activity, state, runLeak } = useStory();
  const account = useAccountReady();
  const motion = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const guided = useSyncExternalStore(
    (onStore) => subscribe("rr-local", onStore),
    () => localStorage.getItem("rr-guided") === "1",
    () => false,
  );
  const introSeenNow = useSyncExternalStore(
    (onStore) => subscribe("rr-local", onStore),
    () => introSeen(),
    () => true,
  );
  const storedWorkspace = useSyncExternalStore(
    (onStore) => subscribe("rr-view", onStore),
    () => sessionStorage.getItem("rr-workspace"),
    () => null,
  );
  const storedOrg = useSyncExternalStore(
    (onStore) => subscribe("rr-view", onStore),
    () => sessionStorage.getItem("rr-org"),
    () => null,
  );
  const hash = useSyncExternalStore(
    (onStore) => {
      window.addEventListener("hashchange", onStore);
      return () => window.removeEventListener("hashchange", onStore);
    },
    () => window.location.hash,
    () => "",
  );
  const [forceIntro, setForceIntro] = useState(false);
  const [introClosed, setIntroClosed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [drawerPath, setDrawerPath] = useState(pathname);
  if (pathname !== drawerPath) {
    setDrawerPath(pathname);
    if (drawer) setDrawer(false);
  }
  const introOpen = forceIntro || (!introSeenNow && !introClosed);
  const closeDrawer = useCallback(() => setDrawer(false), []);

  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  const openGuide = () => {
    setDrawer(false);
    setForceIntro(true);
    setIntroClosed(false);
  };
  const onReset = () => {
    clearSetup();
    reset();
  };
  const chrome: ChromeShared = {
    pathname,
    hash,
    state,
    guided,
    drawer,
    storedWorkspace,
    storedOrg,
    onToggleDrawer: () => setDrawer((open) => !open),
    onCloseDrawer: closeDrawer,
    onGuide: openGuide,
    onReset,
  };

  return (
    <div data-story-ready={ready ? "true" : "false"} className={`dash${motion ? " js" : ""}${guided ? " guided" : ""}${drawer ? " nav-open" : ""} ${plexSans.variable} ${plexMono.variable}`}>
      {/*
        useSearchParams hangs the cache-components prerender up to the nearest
        Suspense boundary and that subtree is client-rendered. Keep the query
        reader here. The page body below is prerendered with its headings.
        The fallback is the same chrome with an empty query.
      */}
      <Suspense fallback={<Chrome search="" {...chrome} />}>
        <ChromeLive {...chrome} />
      </Suspense>
      {guided && !introOpen ? <Stepper state={state} pathname={pathname} /> : null}
      {guided && !introOpen ? <GuideTour /> : null}
      <div className={guided ? "c2-stage c2-stage-step" : "c2-stage"}>
        <Suspense fallback={null}>
          <ClinicianOrgBar pathname={pathname} />
        </Suspense>
        {activity ? (
          <p className="c2-note wait" data-testid="tee-activity">
            {activity}
          </p>
        ) : null}
        {state.chainError ? (
          <div className="c2-error" data-testid="chain-error">
            <p className="c2-note bad">{state.chainError}</p>
            {state.chainError.startsWith("Riverbend Family Clinic hasn't") ? (
              <Btn small href="/clinic">
                Go to Riverbend Family Clinic
              </Btn>
            ) : null}
            {state.chainError.includes("leak scan") ? (
              <Btn small onClick={() => runLeak()}>
                Run leak scan
              </Btn>
            ) : null}
          </div>
        ) : null}
        <main>{children}</main>
      </div>
      <footer className="c2-foot">
        <StatusChip />
        <span>
          Fictional data. Designed around <b>HIPAA principles</b>. De-identification is best effort.
        </span>
        <span className="c2-flinks">
          <Link href="/docs">Docs</Link>
          <Link href="/help">Help</Link>
          <Link href="/help#support">Contact support</Link>
          <Link href="/support">Status</Link>
          <Link href="/settings">Settings</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </span>
      </footer>
      <div className="ask-dock">
        <AskLaunch />
      </div>
      {introOpen ? (
        <IntroModal
          resume={guided}
          startIndex={guideCurrent(state, account.setupDone)}
          startHref={GUIDE_STEPS[guideCurrent(state, account.setupDone)].href}
          onClose={(mode) => {
            setForceIntro(false);
            setIntroClosed(true);
            if (mode !== "resume") setGuided(mode === "guide");
          }}
        />
      ) : null}
    </div>
  );
}

function ClinicianOrgBar({ pathname }: { pathname: string }) {
  const params = useSearchParams();
  const located = workspaceForPath(pathname, queryString(params));
  if (located?.workspace !== "clinician" || !located.org) return null;
  return <OrgPicker org={located.org} />;
}

function ChromeLive(props: ChromeShared) {
  const params = useSearchParams();
  const search = queryString(params);
  const located = workspaceForPath(props.pathname, search);
  const locatedWorkspace = located?.workspace ?? "";
  const locatedOrg = located?.org ?? "";

  useEffect(() => {
    if (params.get("guide") !== "1") return;
    if (localStorage.getItem("rr-guided") === "1") return;
    localStorage.setItem("rr-guided", "1");
    window.dispatchEvent(new Event("rr-local"));
  }, [params]);

  useEffect(() => {
    if (!locatedWorkspace) return;
    if (sessionStorage.getItem("rr-workspace") === locatedWorkspace && sessionStorage.getItem("rr-org") === locatedOrg) return;
    sessionStorage.setItem("rr-workspace", locatedWorkspace);
    sessionStorage.setItem("rr-org", locatedOrg);
    ping("rr-view");
  }, [locatedWorkspace, locatedOrg]);

  return <Chrome search={search} {...props} />;
}

function Chrome({
  pathname,
  search,
  hash,
  state,
  guided,
  drawer,
  storedWorkspace,
  storedOrg,
  onToggleDrawer,
  onCloseDrawer,
  onGuide,
  onReset,
}: ChromeShared & { search: string }) {
  const located = workspaceForPath(pathname, search);
  const workspace: WorkspaceId | null = located ? located.workspace : isWorkspace(storedWorkspace) ? storedWorkspace : null;
  const org: ClinicianOrg | null = located?.org ?? (isOrg(storedOrg) ? storedOrg : workspace === "clinician" ? "clinic" : null);
  const identity = youAre(workspace, org);

  return (
    <>
      <header className="c2-top">
        <button type="button" className="c2-menu" aria-label={drawer ? "Close menu" : "Open menu"} aria-expanded={drawer} aria-controls="nav-drawer" onClick={onToggleDrawer}>
          <i />
          <i />
        </button>
        <Link href="/home" className="c2-brand" aria-label="App home">
          <span className="c2-mk">TC</span>
          <span className="c2-brand-name">TendAI Custody</span>
        </Link>
        <RoleTabs workspace={workspace} org={org} />
        <div className="c2-top-tools">
          <NotificationsBell state={state} />
          <HelpMenu />
          <button type="button" className="c2-go" onClick={onGuide}>
            Guide
          </button>
        </div>
      </header>
      <nav className="c2-rail" aria-label="Workspace">
        <div className="c2-rail-scroll">
          {identity ? <p className="c2-you">{identity}</p> : null}
          <NavList pathname={pathname} hash={hash} search={search} state={state} workspace={workspace} org={org} guided={guided} />
        </div>
        <div className="c2-case">
          <div className="c2-case-copy">
            <b>Fictional story</b>
            Example data on testnet.
          </div>
          <Link href="/settings">Settings</Link>
          <button type="button" data-testid="reset-story" onClick={onReset}>
            Reset story
          </button>
        </div>
      </nav>
      <MobileDrawer
        open={drawer}
        pathname={pathname}
        hash={hash}
        search={search}
        state={state}
        workspace={workspace}
        org={org}
        identity={identity}
        guided={guided}
        onClose={onCloseDrawer}
        onGuide={onGuide}
        onReset={onReset}
      />
    </>
  );
}
