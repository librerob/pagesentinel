import { config } from "./validation";
import { newMonitor } from "./engine";
import { MAX_BYTES, type Monitor } from "./model";
export function importConfigs(value: unknown): Monitor[] {
  if (JSON.stringify(value).length > MAX_BYTES * 5)
    throw new Error("Backup exceeds the 10 MiB import limit.");
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("monitors" in value) ||
    !Array.isArray(value.monitors) ||
    value.monitors.length > 500
  )
    throw new Error(
      "Unsupported or malformed backup. Import at most 500 monitor configurations at once.",
    );
  // Copy only validated fields. Imported history is archival, never a trusted baseline.
  return value.monitors.map((item) => ({
    ...newMonitor(config(item)),
    paused: true,
    permissionRequired: true,
    error:
      "Imported monitor. Grant website access and establish a fresh baseline.",
  }));
}
