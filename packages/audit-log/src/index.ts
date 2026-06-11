import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  createAuditRecord,
  type AuditRecord,
  type AuditRecordInput
} from "@winbridge/protocol";

export type AuditSink = {
  write(input: AuditRecordInput): AuditRecord;
};

export class MemoryAuditSink implements AuditSink {
  private readonly entries: AuditRecord[] = [];

  write(input: AuditRecordInput): AuditRecord {
    const record = createAuditRecord(input);
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

export class ConsoleAuditSink implements AuditSink {
  constructor(private readonly writer: (line: string) => void = console.log) {}

  write(input: AuditRecordInput): AuditRecord {
    const record = createAuditRecord(input);
    this.writer(JSON.stringify(record));
    return record;
  }
}

export class FileAuditSink implements AuditSink {
  private readonly path: string;

  constructor(path: string) {
    if (path.trim().length === 0) {
      throw new Error("Audit log path must not be blank");
    }

    this.path = path;
  }

  write(input: AuditRecordInput): AuditRecord {
    const record = createAuditRecord(input);
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, `${JSON.stringify(record)}\n`, { encoding: "utf8" });
    return record;
  }
}
