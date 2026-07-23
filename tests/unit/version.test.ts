import { describe, expect, it } from 'vitest';
import packageManifest from '../../package.json';
import { APP_META } from '../../src/version';

describe('application metadata', () => {
  it('keeps the runtime name, slug, and version aligned with the package manifest', () => {
    expect(APP_META.name).toBe('Query Quilt');
    expect(APP_META.slug).toBe(packageManifest.name);
    expect(APP_META.version).toBe(packageManifest.version);
  });
});
