export type PillTone = "ok" | "in" | "wn" | "ne" | "bd";

export type WallCard = {
  title: string;
  detail: string;
  tone: PillTone;
  status: string;
  id: string;
};

/** Fictional example rows for the marquee. Order matches the locked mockup. */
export const wallCards: WallCard[] = [
  { title: "Brindleglass Hospital", detail: "Transfer", tone: "ok", status: "Approved", id: "REL-0412" },
  { title: "Dr. Reyes", detail: "Second-opinion share", tone: "ok", status: "Approved", id: "REL-0413" },
  { title: "PulseFit app", detail: "De-identified copy", tone: "in", status: "Preview first", id: "REL-0414" },
  { title: "Custody entry", detail: "Logged on NEAR", tone: "ok", status: "Logged", id: "REL-0415" },
  { title: "Summary (TEE)", detail: "NEAR AI Cloud", tone: "in", status: "Patient review", id: "REL-0416" },
  { title: "Imaging set", detail: "Three scans", tone: "wn", status: "Expires 09:00", id: "REL-0417" },
  { title: "Clinic notes", detail: "Held back", tone: "ne", status: "Not shared", id: "REL-0418" },
  { title: "Dr. Lena Park", detail: "Referral", tone: "wn", status: "Pending", id: "REL-0419" },
  { title: "Northgate Heart Institute", detail: "Second opinion", tone: "bd", status: "Revoked", id: "REL-0420" },
  { title: "Wellness app", detail: "Best-effort de-id", tone: "in", status: "Preview first", id: "REL-0421" },
  { title: "Lab results", detail: "Last 12 months", tone: "ok", status: "Shared", id: "REL-0422" },
  { title: "Cardiology consult", detail: "Thu 10:30", tone: "ok", status: "Approved", id: "REL-0423" },
];
