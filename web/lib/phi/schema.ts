/** True when a view failed because the contract has no such method. */
export function contractMethodMissing(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return (
    text.includes("MethodNotFound") ||
    text.includes("MethodResolveError") ||
    text.includes("Contract method is not found")
  );
}
