import { SourceFault } from './handler.js';

export class SourceStore {
  constructor(sql, locks) {
    this.sql = sql;
    this.locks = locks;
  }

  async authorize(hash) {
    const [row] = await this.sql`SELECT id FROM atlas_ai.holder_leases
      WHERE token_sha256 = decode(${hash}, 'hex') AND revoked_at IS NULL AND expires_at > clock_timestamp()`;
    return row?.id ?? null;
  }

  lockUpload(id, apply) {
    // A separate pool holds the transaction-scoped lock while reservations commit
    // and Storage makes its own writes. An interrupted transfer leaves its bytes
    // reserved. A retry resumes the same immutable object keys.
    return this.locks.begin(async tx => {
      const [{ acquired }] = await tx`SELECT pg_try_advisory_xact_lock(hashtextextended(${id}, 20261124)) AS acquired`;
      if (!acquired) throw new SourceFault('TRANSFER_PENDING', 409);
      return apply();
    });
  }

  list(owner) {
    return this.sql`SELECT * FROM atlas_sources.list_uploads(${owner})`;
  }

  async usage(owner) {
    const [{ usage }] = await this.sql`SELECT atlas_sources.storage_usage(${owner}) AS usage`;
    return usage;
  }

  async metrics(owner) {
    const [{ metrics }] = await this.sql`SELECT atlas_sources.storage_metrics(${owner}) AS metrics`;
    return metrics;
  }

  async find(owner, id) {
    const [row] = await this.sql`SELECT * FROM atlas_sources.uploads WHERE owner_id = ${owner} AND id = ${id}::uuid`;
    return row;
  }

  async reserve(owner, data) {
    const [row] = await this.sql`SELECT * FROM atlas_sources.reserve_upload(
      ${owner}, ${data.id}::uuid, ${data.placeId}, ${data.sourceId}, ${data.filename}, ${data.contentType},
      ${data.contentSha256}, ${data.originalBytes}, ${data.previewBytes}, ${data.previewSha256}
    )`;
    return row;
  }

  async finishUpload(owner, id) {
    const [row] = await this.sql`SELECT * FROM atlas_sources.finish_upload(${owner}, ${id}::uuid)`;
    return row;
  }

  async publish(owner, id, scores) {
    const [row] = await this.sql`SELECT * FROM atlas_sources.publish_upload(${owner}, ${id}::uuid, ${this.sql.json(scores)})`;
    return row;
  }

  async beginDelete(owner, id) {
    const [row] = await this.sql`SELECT * FROM atlas_sources.begin_delete(${owner}, ${id}::uuid)`;
    return row;
  }

  async finishDelete(owner, id) {
    const [row] = await this.sql`SELECT * FROM atlas_sources.finish_delete(${owner}, ${id}::uuid)`;
    return row;
  }

  async recordEgress(owner, id, variant, bytes) {
    await this.sql`SELECT atlas_sources.record_egress(${owner}, ${id}::uuid, ${variant}, ${bytes})`;
  }
}
