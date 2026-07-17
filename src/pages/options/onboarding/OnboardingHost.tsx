import { useOnboarding } from "./OnboardingProvider";
import { WelcomeDialog } from "./WelcomeDialog";
import { OnboardingOverlay } from "./OnboardingOverlay";
import { OnboardingPopover } from "./OnboardingPopover";

export function OnboardingHost() {
  const { phase } = useOnboarding();
  if (phase === "welcome") return <WelcomeDialog />;
  if (phase === "tour") {
    return (
      <>
        <OnboardingOverlay />
        <OnboardingPopover />
      </>
    );
  }
  return null;
}
