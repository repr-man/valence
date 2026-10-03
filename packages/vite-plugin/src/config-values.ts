/** Window options are embedded in generated code; reject values JSON would silently lose. */
export function serializeWindowOptions(value: unknown): string {
  const ancestors = new Set<object>();
  function validate(item: unknown, path: string): void {
    if (item === undefined || item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (typeof item !== 'object' || ancestors.has(item)) {
      throw new Error(`valence: ${path} must be a serializable window option (no functions, native objects, or cycles).`);
    }
    const prototype: unknown = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null) {
      throw new Error(`valence: ${path} cannot embed an Electron object in the build. Use a file path for icons and a lifecycle hook for runtime customization.`);
    }
    ancestors.add(item);
    for (const [key, child] of Object.entries(item)) validate(child, `${path}.${key}`);
    ancestors.delete(item);
  }
  validate(value, 'window');
  return JSON.stringify(value ?? {});
}
