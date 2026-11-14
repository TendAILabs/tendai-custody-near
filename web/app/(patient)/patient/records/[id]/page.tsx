"use client";

import { useParams } from "next/navigation";
import { RecordDetail } from "@/components/wireframe/record-detail";

export default function Page() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  return <RecordDetail id={id} />;
}
