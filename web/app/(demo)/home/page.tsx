import { Suspense } from "react";
import { HomeScreen } from "@/components/wireframe/home-screen";

export default function Page() {
  return (
    <Suspense fallback={<p className="c2-lede">Loading this desk.</p>}>
      <HomeScreen />
    </Suspense>
  );
}
