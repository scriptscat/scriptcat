import { useIsMobile } from "@App/pages/components/use-is-mobile";
import { useImport } from "./hooks";
import { DesktopView } from "./components";
import { MobileView } from "./mobile";

export default function App() {
  const view = useImport();
  const isMobile = useIsMobile();
  return isMobile ? <MobileView view={view} /> : <DesktopView view={view} />;
}
