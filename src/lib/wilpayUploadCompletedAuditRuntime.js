import { createWilpayFileAuditInsertAdapter } from './wilpayFileAuditInsertAdapter.js';
import { createWilpayUploadCompletedAuditWriter } from './wilpayUploadCompletedAuditWriter.js';

/**
 * Composes the completed-upload audit writer with the parameterized append-only
 * database adapter. This module is intentionally server-side/infrastructure-only:
 * callers inject a query(sql, params) function already bound to the exclusive
 * W.I.L Pay database. No connection string, token or provider credential is
 * accepted or returned here.
 */
export function createWilpayUploadCompletedAuditRuntime({ query } = {}) {
  if (typeof query !== 'function') {
    throw new Error('Exclusive W.I.L Pay audit query function is required');
  }

  const insertAuditRow = createWilpayFileAuditInsertAdapter({ query });
  const auditUploadCompleted = createWilpayUploadCompletedAuditWriter({ insertAuditRow });

  return Object.freeze({ auditUploadCompleted });
}
