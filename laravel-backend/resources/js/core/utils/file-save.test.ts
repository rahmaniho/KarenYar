import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveBlob } from './file-save';

describe('ذخیره‌ی فایل خروجی (وب)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('در وب، دانلود با لینک موقت انجام می‌شود (مسیر بومی فعال نیست)', async () => {
    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await saveBlob('test.json', new Blob(['{}'], { type: 'application/json' }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
