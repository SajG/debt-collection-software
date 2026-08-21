// Local id generator for direct client inserts. Mirrors the format
// used by the offline queues (Date.now() + random). Not cryptographic
// — just needs to be collision-free enough for a single device.
//
// Web / SECURITY DEFINER RPCs generate ids via Prisma's cuid(); on
// direct mobile inserts we generate here and pass the id in the
// row payload because none of the tables have a DB-side DEFAULT.

export function newId(prefix = "m"): string {
  return (
    prefix +
    "_" +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  );
}
