import { config } from "./validation";
import { newMonitor } from "./engine";
import { type Monitor, type Company } from "./model";
import { companyConfig } from "./privacy";
export function importConfigs(value: unknown): Monitor[] {
  if (
    new TextEncoder().encode(JSON.stringify(value)).byteLength >
    64 * 1024 * 1024
  )
    throw new Error("Backup exceeds the 64 MiB decrypted import limit.");
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("monitors" in value) ||
    !Array.isArray(value.monitors)
  )
    throw new Error(
      "Unsupported or malformed backup. Use a PageSentinel JSON export.",
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
export function importBundle(value: unknown): {
  monitors: Monitor[];
  companies: Company[];
} {
  const monitors = importConfigs(value),
    input = value as Record<string, unknown>;
  const companies: Company[] = [],
    ids = new Map<string, string>();
  if (input.companies !== undefined) {
    if (!Array.isArray(input.companies))
      throw new Error("Invalid backup companies.");
    for (const item of input.companies) {
      if (
        !item ||
        typeof item !== "object" ||
        typeof item.id !== "string" ||
        item.id.length > 100 ||
        ids.has(item.id)
      )
        throw new Error("Invalid or duplicate backup company ID.");
      const company = companyConfig(item);
      company.paused = true;
      ids.set(item.id, company.id);
      companies.push(company);
    }
  }
  for (const monitor of monitors) {
    if (monitor.kind !== "policy") monitor.companyId = undefined;
    monitor.companyId = monitor.companyId
      ? ids.get(monitor.companyId)
      : undefined;
    monitor.companyPaused = monitor.companyId ? true : undefined;
    if (!monitor.companyId) monitor.inheritInterval = undefined;
  }
  return { monitors, companies };
}
