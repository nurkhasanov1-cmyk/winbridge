import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  createAuditRecord,
  stringifyJson,
  type AuditRecord,
  type AuditRecordInput
} from "@winbridge/protocol";

export type AuditSink = {
  write(input: AuditRecordInput): AuditRecord;
};

export class MemoryAuditSink implements AuditSink {
  private readonly entries: AuditRecord[] = [];

  write(input: AuditRecordInput): AuditRecord {
    const record = deepFreeze(createAuditRecord(input));
    this.entries.push(record);
    return record;
  }

  records(): AuditRecord[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries.length = 0;
  }
}

function deepFreeze<T>(value: T, visited = new WeakSet<object>()): T {
  const valueType = typeof value;
  if (!value || (valueType !== "object" && valueType !== "function")) {
    return value;
  }

  const objectValue = value as object;
  if (visited.has(objectValue)) {
    return value;
  }
  visited.add(objectValue);

  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested, visited);
  }

  if (!Object.isFrozen(objectValue)) {
    Object.freeze(objectValue);
  }

  return value;
}

export class ConsoleAuditSink implements AuditSink {
  constructor(private readonly writer: (line: string) => void = console.log) {}

  write(input: AuditRecordInput): AuditRecord {
    const record = createAuditRecord(input);
    this.writer(stringifyJson(record));
    return record;
  }
}

export class FileAuditSink implements AuditSink {
  private readonly path: string;

  constructor(path: string) {
    if (path.trim().length === 0 || path !== path.trim()) {
      throw new Error("Audit log path must be non-blank and already trimmed");
    }

    this.path = path;
  }

  write(input: AuditRecordInput): AuditRecord {
    const record = createAuditRecord(input);
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, `${stringifyJson(record)}\n`, { encoding: "utf8" });
    return record;
  }
}
