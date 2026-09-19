import { beforeEach, describe, expect, it, vi } from 'vitest';
import { guessColumnMapping, parseCSV } from './csvParser';
import { CSV_HEADER, csvWithStatuses } from './testFixtures';

/**
 * The Supabase client is replaced wholesale so these tests can assert on *when*
 * the write layer is reached, not just on what it is given. vi.hoisted is needed
 * because vi.mock is hoisted above the module body, so the spy has to exist
 * before this file's own declarations run.
 */
const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: { from: fromMock } }));

const { processCSVUpload } = await import('./api');

const MAPPING = guessColumnMapping(parseCSV(CSV_HEADER).headers);
const UPLOAD_ID = 'up_1';

interface Behaviour {
  /** Result of `from('uploads').insert(...).select().single()`. */
  uploadInsert?: { data: unknown; error: { message: string } | null };
  /** Error returned by `from('leads').insert(batch)`. */
  leadsInsertError?: { message: string } | null;
}

function installSupabaseMock(behaviour: Behaviour = {}) {
  const calls = {
    uploadsInsert: vi.fn(),
    uploadsDelete: vi.fn(),
    leadsInsert: vi.fn(),
  };

  fromMock.mockImplementation((table: string) => {
    if (table === 'uploads') {
      return {
        insert: (payload: unknown) => {
          calls.uploadsInsert(payload);
          return {
            select: () => ({
              single: async () =>
                behaviour.uploadInsert ?? { data: { id: UPLOAD_ID }, error: null },
            }),
          };
        },
        delete: () => ({
          eq: async (column: string, value: unknown) => {
            calls.uploadsDelete({ [column]: value });
            return { error: null };
          },
        }),
      };
    }

    if (table === 'leads') {
      return {
        insert: async (batch: unknown[]) => {
          calls.leadsInsert(batch);
          return { error: behaviour.leadsInsertError ?? null };
        },
      };
    }

    // Surfaces mock drift rather than returning undefined and failing obscurely.
    throw new Error(`Unexpected table in test: ${table}`);
  });

  return calls;
}

beforeEach(() => {
  fromMock.mockReset();
});

describe('processCSVUpload rejects before touching the database', () => {
  // The upload row is what getMonthlyLeadCount and the enforce_monthly_lead_limit
  // trigger both count against the plan. Creating one for a file that cannot be
  // scored charges the customer's quota for nothing, which is the bug this guards.
  it('never writes anything when no lead is marked converted', async () => {
    const calls = installSupabaseMock();

    await expect(
      processCSVUpload(
        'ws_1',
        'no-wins.csv',
        csvWithStatuses(['lost', 'lost', 'no_response', 'new']),
        MAPPING
      )
    ).rejects.toThrow('No leads are marked as converted');

    expect(fromMock).not.toHaveBeenCalled();
    expect(calls.uploadsInsert).not.toHaveBeenCalled();
    expect(calls.leadsInsert).not.toHaveBeenCalled();
  });

  it('never writes anything for a headers-only file', async () => {
    const calls = installSupabaseMock();

    await expect(
      processCSVUpload('ws_1', 'template.csv', csvWithStatuses([]), MAPPING)
    ).rejects.toThrow('No leads found in the CSV file.');

    expect(fromMock).not.toHaveBeenCalled();
    expect(calls.uploadsInsert).not.toHaveBeenCalled();
  });

  // Positive control. Without this, the two tests above would still pass if the
  // mock were wired up wrongly and the write layer were unreachable in every case.
  it('does reach the write layer for a file it can score', async () => {
    const calls = installSupabaseMock();

    const result = await processCSVUpload(
      'ws_1',
      'good.csv',
      csvWithStatuses(['won', 'lost', 'won', 'no_response', 'lost']),
      MAPPING
    );

    expect(calls.uploadsInsert).toHaveBeenCalledTimes(1);
    expect(calls.leadsInsert).toHaveBeenCalledTimes(1);
    expect(result.leadCount).toBe(5);
    expect(calls.uploadsInsert.mock.calls[0][0]).toMatchObject({
      workspace_id: 'ws_1',
      file_name: 'good.csv',
      row_count: 5,
      status: 'completed',
    });
  });
});

describe('processCSVUpload write failures', () => {
  it('does not attempt to save leads when the upload row cannot be created', async () => {
    const calls = installSupabaseMock({
      uploadInsert: { data: null, error: { message: 'permission denied' } },
    });

    await expect(
      processCSVUpload('ws_1', 'good.csv', csvWithStatuses(['won', 'lost']), MAPPING)
    ).rejects.toThrow('Failed to create upload record.');

    expect(calls.leadsInsert).not.toHaveBeenCalled();
  });

  // Otherwise the upload row survives as 'completed' carrying a row_count that
  // keeps being charged against the monthly limit for leads that were never saved.
  it('deletes the upload row when saving leads fails', async () => {
    const calls = installSupabaseMock({ leadsInsertError: { message: 'boom' } });

    await expect(
      processCSVUpload('ws_1', 'good.csv', csvWithStatuses(['won', 'lost']), MAPPING)
    ).rejects.toThrow('Failed to save leads: boom');

    expect(calls.uploadsDelete).toHaveBeenCalledWith({ id: UPLOAD_ID });
  });
});

describe('processCSVUpload batching', () => {
  it('splits large files into batches of 500', async () => {
    const calls = installSupabaseMock();
    const statuses = Array.from({ length: 1001 }, (_, i) => (i % 3 === 0 ? 'won' : 'lost'));

    const result = await processCSVUpload('ws_1', 'big.csv', csvWithStatuses(statuses), MAPPING);

    expect(result.leadCount).toBe(1001);
    expect(calls.leadsInsert).toHaveBeenCalledTimes(3);
    expect(calls.leadsInsert.mock.calls.map(([batch]) => batch.length)).toEqual([500, 500, 1]);
  });
});
