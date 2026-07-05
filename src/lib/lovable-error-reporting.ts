export function reportLovableError(error: Error, context?: Record<string, unknown>): void {
  console.error("[Lovable Error]", error, context);
}
