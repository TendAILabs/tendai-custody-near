export class IncompleteCoverage extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IncompleteCoverage";
  }
}

export async function collectPages<T>(input: {
  limit: number;
  maxPages: number;
  label: string;
  load: (from: number, limit: number) => Promise<T[]>;
}): Promise<T[]> {
  if (input.limit < 1 || input.maxPages < 1) throw new IncompleteCoverage(`incomplete coverage: ${input.label}`);
  const items: T[] = [];
  for (let page = 0; page < input.maxPages; page += 1) {
    let batch: T[];
    try {
      batch = await input.load(page * input.limit, input.limit);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "page failed";
      throw new IncompleteCoverage(`incomplete coverage: ${input.label}: ${detail}`);
    }
    if (!Array.isArray(batch) || batch.length > input.limit) {
      throw new IncompleteCoverage(`incomplete coverage: ${input.label}`);
    }
    items.push(...batch);
    if (batch.length < input.limit) return items;
  }
  throw new IncompleteCoverage(`incomplete coverage: ${input.label}`);
}

/**
 * Walk numeric ids with no fixed upper bound. A run of missing ids ends the
 * range. One missing id does not, so a later record is still visited.
 * An error, or still finding rows at maxIds, is incomplete coverage.
 */
export async function collectIds<T>(input: {
  label: string;
  gap: number;
  maxIds: number;
  load: (id: number) => Promise<T | null>;
}): Promise<T[]> {
  if (input.gap < 1 || input.maxIds < 1) throw new IncompleteCoverage(`incomplete coverage: ${input.label}`);
  const items: T[] = [];
  let missing = 0;
  for (let id = 1; id <= input.maxIds; id += 1) {
    let row: T | null;
    try {
      row = await input.load(id);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "read failed";
      throw new IncompleteCoverage(`incomplete coverage: ${input.label}: ${detail}`);
    }
    if (row == null) {
      missing += 1;
      if (missing >= input.gap) return items;
      continue;
    }
    missing = 0;
    items.push(row);
  }
  throw new IncompleteCoverage(`incomplete coverage: ${input.label}`);
}
