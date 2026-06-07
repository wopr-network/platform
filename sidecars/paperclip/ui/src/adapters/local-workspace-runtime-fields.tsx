import type { AdapterConfigFieldsProps } from "./types";
import { useHostedMode } from "../../hooks/useHostedMode";

export function LocalWorkspaceRuntimeFields(_props: AdapterConfigFieldsProps) {
  const { isHosted } = useHostedMode();
  if (isHosted) return null;
  return null;
}
