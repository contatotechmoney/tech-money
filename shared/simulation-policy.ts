// Release policy, intentionally not controlled by environment variables or provider configuration.
// Re-enabling real delivery requires a separate reviewed release.
export const REAL_REPORT_DELIVERY_ENABLED = false;

// Historical origin is not established. Monitoring is deliberately suspended
// for this simulation phase; do not infer that these records belong to an old portal.
export const REPORT_DELIVERY_MONITORING_ENABLED = false;

export function shouldStartReportDeliveryWorker(environment: string | undefined): boolean {
  return environment === "production"
    && (REAL_REPORT_DELIVERY_ENABLED || REPORT_DELIVERY_MONITORING_ENABLED);
}
