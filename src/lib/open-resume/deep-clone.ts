/** JSON deep clone (from OpenResume). */
export const deepClone = <T extends { [key: string]: unknown }>(object: T): T =>
  JSON.parse(JSON.stringify(object)) as T;
