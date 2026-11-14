"use client";

import { ActivityLog } from "./activity/activity-log";

export function HistoryScreen(_props: { titleAs?: "h1" | "h2" }) {
  return <ActivityLog />;
}

export function TimelineScreen(props: { titleAs?: "h1" | "h2" }) {
  return <HistoryScreen {...props} />;
}
