import { useIsMobile } from "@App/pages/components/use-is-mobile";
import { useBatchUpdate } from "./hooks";
import { DesktopView } from "./components";
import { MobileView } from "./mobile";

export default function App() {
  const view = useBatchUpdate();
  const isMobile = useIsMobile();
  return isMobile ? <MobileView view={view} /> : <DesktopView view={view} />;
}
