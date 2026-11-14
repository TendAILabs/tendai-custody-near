"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { adminDash, clinicDash, hospitalDash, patientDash, WHO, youAre, type ClinicianOrg, type WorkspaceId } from "@/lib/nav/model";
import { useStory } from "@/lib/story-context";
import { useAccountReady } from "@/lib/visitor/use-account";
import { Btn, PageHead } from "./c2";
import { PatientSetup } from "./patient-setup";

const COPY: Record<string, { eyebrow: string; title: string; mark?: string; what: string; can: string }> = {
  patient: {
    eyebrow: "Patient",
    title: "Your records at a",
    mark: "glance",
    what: "This is Maya's home for the fictional chart in this browser.",
    can: "You can see open requests, who has access, and the next thing to do.",
  },
  clinic: {
    eyebrow: "Riverbend Family Clinic",
    title: "Referrals you",
    mark: "sent",
    what: "This is the sending clinic's view of Maya's referral.",
    can: "You can see what was sent, what Maya approved, and what is still waiting.",
  },
  hospital: {
    eyebrow: "St. Aster Hospital",
    title: "Referrals sent to",
    mark: "you",
    what: "This is the receiving hospital's view of Maya's referral.",
    can: "You can see what is waiting on her approval and what is ready to open.",
  },
  admin: {
    eyebrow: "Admin",
    title: "Access and activity",
    mark: "overview",
    what: "This is a read-only view of the fictional chart for a compliance reviewer.",
    can: "You can see active shares, opens, revokes, and refused opens.",
  },
  home: {
    eyebrow: "Home",
    title: "Choose who you",
    mark: "are",
    what: "This demo follows one fictional referral, and you play each person in turn.",
    can: "Pick Patient, Clinician, Admin, or Proof. The guide can switch roles for you.",
  },
};

export function HomeScreen() {
  const { state } = useStory();
  const account = useAccountReady();
  const params = useSearchParams();
  const role = params.get("role");
  const workspace: WorkspaceId | null = role === "patient" || role === "admin" ? role : role === "clinic" || role === "hospital" ? "clinician" : null;
  const org: ClinicianOrg | null = role === "hospital" ? "hospital" : role === "clinic" ? "clinic" : null;
  const copy = COPY[role && COPY[role] ? role : "home"];
  const dash =
    role === "patient"
      ? patientDash(state, account.setupDone)
      : role === "clinic"
        ? clinicDash(state)
        : role === "hospital"
          ? hospitalDash(state)
          : role === "admin"
            ? adminDash(state)
            : null;
  const identity = youAre(workspace, org);

  return (
    <div>
      <PageHead index="" eyebrow={copy.eyebrow} title={copy.title} mark={copy.mark} what={copy.what} can={copy.can} state={state} />
      {identity ? <p className="c2-lede">{identity}</p> : null}
      <section className="c2-who" aria-label="Who's who">
        {WHO.map((person) => (
          <article key={person.name}>
            <p className="c2-lab ink">{person.place}</p>
            <h2>{person.name}</h2>
            <p>{person.line}</p>
          </article>
        ))}
      </section>
      {role === "patient" ? <PatientSetup /> : null}
      {dash ? (
        <section className="c2-sec">
          <div className="c2-counts">
            {dash.counts.map((count) => (
              <div key={count.label}>
                <b>{count.value}</b>
                <span>{count.label}</span>
              </div>
            ))}
          </div>
          <p className="c2-lede">
            Next: <Link href={dash.nextHref}>{dash.nextLabel}</Link>
          </p>
          <Btn small href={dash.nextHref}>
            Continue
          </Btn>
        </section>
      ) : (
        <div className="c2-role-grid">
          <article className="c2-role">
            <p className="k">Patient</p>
            <h2>Maya Okafor</h2>
            <p className="desc">She reviews requests and can revoke access later.</p>
            <Btn small href="/home?role=patient">
              Open the patient desk
            </Btn>
          </article>
          <article className="c2-role">
            <p className="k">Clinician</p>
            <h2>Riverbend Family Clinic</h2>
            <p className="desc">Dr. Lena Park sends the referral. The organization selector on the clinician desk switches to St. Aster Hospital or Northgate Heart Institute.</p>
            <Btn small href="/home?role=clinic">
              Open the clinic desk
            </Btn>
          </article>
          <article className="c2-role">
            <p className="k">Admin</p>
            <h2>Compliance review</h2>
            <p className="desc">A read-only look at who can still open records. Designed around HIPAA principles.</p>
            <Btn small href="/home?role=admin">
              Open the admin desk
            </Btn>
          </article>
          <article className="c2-role">
            <p className="k">Proof</p>
            <h2>What is real</h2>
            <p className="desc">See what runs on NEAR testnet and what the sealed summary can prove.</p>
            <Btn small href="/start">
              Open the proof
            </Btn>
          </article>
        </div>
      )}
    </div>
  );
}
