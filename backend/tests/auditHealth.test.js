// A lost audit row must not be silent.
//
// Audit writes are fire-and-forget on purpose: a broken audit table must never
// take down the clinical read it describes (utils/audit.js). The cost used to be
// that a dropped row was invisible — which matters more here than in most
// systems, because `athlete.view` logging is the stated justification for
// leaving medical staff UNSCOPED (§51). "Any clinician may open any record
// because every open is recorded" only holds if the recording actually happens.
//
// So these tests assert the two halves that were previously in tension:
//   * the caller is never made to fail by a logging failure, and
//   * the failure is nonetheless counted and surfaced.

const mockCreate = jest.fn();
const mockSetSetting = jest.fn(async () => {});

jest.mock('../src/models', () => ({ AuditLog: { create: (...a) => mockCreate(...a) } }));
jest.mock('../src/utils/settings', () => ({ setSetting: (...a) => mockSetSetting(...a) }));

const {
  recordAudit, auditFailures, resetAuditFailures, FAILURE_KEY,
} = require('../src/utils/audit');

// The write is not awaited by the caller, so a test has to let the rejection
// settle before asserting on its consequences.
const settle = () => new Promise((r) => { setImmediate(r); });

const req = { user: { id: 1, name: 'Medical Demo 01', role: 'medical' } };

beforeEach(() => {
  resetAuditFailures();
  mockCreate.mockReset();
  mockSetSetting.mockReset();
  mockSetSetting.mockResolvedValue(undefined);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => { console.error.mockRestore(); });

describe('the happy path stays quiet', () => {
  it('reports no failures when writes succeed', async () => {
    mockCreate.mockResolvedValue({});
    recordAudit(req, { action: 'athlete.view', entity: 'athlete', entityId: '070202021001' });
    await settle();
    // Null, not a zeroed object: an "audit healthy" badge that is only ever
    // green teaches people to stop reading it.
    expect(auditFailures()).toBeNull();
  });
});

describe('a failed write is counted, not swallowed', () => {
  it('does not throw at the caller', async () => {
    mockCreate.mockRejectedValue(new Error('Table \'airms.audit_logs\' doesn\'t exist'));
    // The property this whole design exists to protect: the clinical operation
    // being described must still succeed.
    expect(() => recordAudit(req, { action: 'athlete.view' })).not.toThrow();
    await settle();
  });

  it('records the count, the action and the reason', async () => {
    mockCreate.mockRejectedValue(new Error('meta too large'));
    recordAudit(req, { action: 'screening.import' });
    await settle();

    const h = auditFailures();
    expect(h.count).toBe(1);
    expect(h.lastAction).toBe('screening.import');
    expect(h.lastError).toMatch(/meta too large/);
    expect(h.lastAt).toMatch(/Z$/);
  });

  it('accumulates across several failures', async () => {
    mockCreate.mockRejectedValue(new Error('down'));
    recordAudit(req, { action: 'athlete.view' });
    recordAudit(req, { action: 'norm.pin' });
    recordAudit(req, { action: 'report.download' });
    await settle();
    expect(auditFailures().count).toBe(3);
    // The LAST one is what an administrator is shown first.
    expect(auditFailures().lastAction).toBe('report.download');
  });

  it('tries to persist the count so it survives a restart', async () => {
    mockCreate.mockRejectedValue(new Error('down'));
    recordAudit(req, { action: 'athlete.view' });
    await settle();
    expect(mockSetSetting).toHaveBeenCalledWith(FAILURE_KEY, expect.objectContaining({
      count: 1, lastAction: 'athlete.view',
    }));
  });

  it('still counts in memory when persisting ALSO fails', async () => {
    // The realistic case: the database is down, so both the audit write and the
    // settings write fail. The in-process counter is the only thing left, and it
    // is why the count is not kept solely in the table.
    mockCreate.mockRejectedValue(new Error('connection lost'));
    mockSetSetting.mockRejectedValue(new Error('connection lost'));
    recordAudit(req, { action: 'athlete.view' });
    await settle();
    expect(auditFailures().count).toBe(1);
  });

  it('logs the failure structurally so it can be alerted on', async () => {
    mockCreate.mockRejectedValue(new Error('down'));
    recordAudit(req, { action: 'athlete.view' });
    await settle();
    const line = console.error.mock.calls.at(-1)[0];
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe('error');
    expect(parsed.event).toBe('audit.write_failed');
    // The ACTION is a verb, safe to log. Anything athlete-shaped is redacted by
    // the logger, which is asserted in logger.test.js.
    expect(parsed.action).toBe('athlete.view');
  });
});
