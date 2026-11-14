import { LandingView } from "@/components/landing/landing-view";
import { plexMono, plexSans } from "@/components/landing/fonts";

export default function Page() {
  return <LandingView fontClass={`${plexSans.variable} ${plexMono.variable}`} />;
}
