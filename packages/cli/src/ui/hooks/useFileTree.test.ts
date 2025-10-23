/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFileTree } from './useFileTree.js';

// Mock file system
vi.mock('fs', () => ({
  default: {
    readdirSync: vi.fn(),
    statSync: vi.fn(),
  },
}));

vi.mock('path', () => ({
  default: {
    join: vi.fn((...args) => args.join('/')),
    extname: vi.fn((p) => p.split('.').pop() || ''),
  },
}));

describe('useFileTree', () => {
  const mockFs = vi.mocked(await import('fs')).default;
  const mockPath = vi.mocked(await import('path')).default;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockFs.readdirSync.mockReturnValue([
      'src',
      'package.json',
      'README.md',
      'hidden.txt',
      'node_modules',
    ] as any);

    mockFs.statSync.mockImplementation((path: string) => ({
      isDirectory: () => path.includes('src') || path.includes('node_modules'),
      isFile: () => !path.includes('src') && !path.includes('node_modules'),
    }));

    mockPath.join.mockImplementation((...args) => args.join('/'));
    mockPath.extname.mockImplementation((p) => p.split('.').pop() || '');
  });

  it('initializes with empty tree data', () => {
    const { result } = renderHook(() => useFileTree('/test'));

    expect(result.current.treeData).toEqual([]);
  });

  it('loads file tree data correctly', () => {
    const { result } = renderHook(() => useFileTree('/test'));

    act(() => {
      result.current.loadTree('/test');
    });

    expect(mockFs.readdirSync).toHaveBeenCalledWith('/test');
    expect(result.current.treeData).toBeDefined();
  });

  it('filters out hidden files and directories', () => {
    const { result } = renderHook(() => useFileTree('/test'));

    act(() => {
      result.current.loadTree('/test');
    });

    const treeData = result.current.treeData;

    // Should not include hidden files
    expect(treeData.find(item => item.name === 'hidden.txt')).toBeUndefined();
    expect(treeData.find(item => item.name.startsWith('.'))).toBeUndefined();
  });

  it('filters out node_modules directory', () => {
    const { result } = renderHook(() => useFileTree('/test'));

    act(() => {
      result.current.loadTree('/test');
    });

    const treeData = result.current.treeData;

    // Should not include node_modules
    expect(treeData.find(item => item.name === 'node_modules')).toBeUndefined();
  });

  it('sorts directories before files', () => {
    const { result } = renderHook(() => useFileTree('/test'));

    act(() => {
      result.current.loadTree('/test');
    });

    const treeData = result.current.treeData;

    // Find first file index
    const firstFileIndex = treeData.findIndex(item => item.type === 'file');

    // All directories should come before files
    const directories = treeData.slice(0, firstFileIndex);
    const files = treeData.slice(firstFileIndex);

    expect(directories.every(item => item.type === 'directory')).toBe(true);
    expect(files.every(item => item.type === 'file')).toBe(true);
  });

  it('sorts items alphabetically within types', () => {
    mockFs.readdirSync.mockReturnValue([
      'z-file.ts',
      'a-file.js',
      'm-file.tsx',
      'src',
      'components',
    ] as any);

    mockFs.statSync.mockImplementation((path: string) => ({
      isDirectory: () => path.includes('src') || path.includes('components'),
      isFile: () => !path.includes('src') && !path.includes('components'),
    }));

    const { result } = renderHook(() => useFileTree('/test'));

    act(() => {
      result.current.loadTree('/test');
    });

    const treeData = result.current.treeData;

    // Check directory sorting
    const directories = treeData.filter(item => item.type === 'directory');
    expect(directories[0].name).toBe('components');
    expect(directories[1].name).toBe('src');

    // Check file sorting
    const files = treeData.filter(item => item.type === 'file');
    expect(files[0].name).toBe('a-file.js');
    expect(files[1].name).toBe('m-file.tsx');
    expect(files[2].name).toBe('z-file.ts');
  });

  it('filters file types appropriately', () => {
    mockFs.readdirSync.mockReturnValue([
      'script.py',      // Should be excluded
      'document.pdf',   // Should be excluded
      'image.png',      // Should be excluded
      'code.ts',        // Should be included
      'config.json',    // Should be included
      'readme.md',      // Should be included
    ] as any);

    mockFs.statSync.mockReturnValue({
      isDirectory: () => false,
      isFile: () => true,
    });

    const { result } = renderHook(() => useFileTree('/test'));

    act(() => {
      result.current.loadTree('/test');
    });

    const treeData = result.current.treeData;

    // Should only include relevant file types
    expect(treeData.find(item => item.name === 'script.py')).toBeUndefined();
    expect(treeData.find(item => item.name === 'document.pdf')).toBeUndefined();
    expect(treeData.find(item => item.name === 'image.png')).toBeUndefined();

    expect(treeData.find(item => item.name === 'code.ts')).toBeDefined();
    expect(treeData.find(item => item.name === 'config.json')).toBeDefined();
    expect(treeData.find(item => item.name === 'readme.md')).toBeDefined();
  });

  it('handles file system errors gracefully', () => {
    mockFs.readdirSync.mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const { result } = renderHook(() => useFileTree('/test'));

    act(() => {
      result.current.loadTree('/test');
    });

    // Should handle error without crashing
    expect(result.current.treeData).toEqual([]);
  });

  it('creates correct file paths', () => {
    const { result } = renderHook(() => useFileTree('/test'));

    act(() => {
      result.current.loadTree('/test');
    });

    expect(mockPath.join).toHaveBeenCalled();
    expect(mockFs.readdirSync).toHaveBeenCalledWith('/test');
  });

  it('handles empty directories', () => {
    mockFs.readdirSync.mockReturnValue([] as any);

    const { result } = renderHook(() => useFileTree('/test'));

    act(() => {
      result.current.loadTree('/test');
    });

    expect(result.current.treeData).toEqual([]);
  });

  it('handles nested directory structures', () => {
    mockFs.readdirSync.mockImplementation((path: string) => {
      if (path === '/test') {
        return ['src', 'package.json'] as any;
      }
      if (path === '/test/src') {
        return ['components', 'App.tsx'] as any;
      }
      if (path === '/test/src/components') {
        return ['Button.tsx', 'Input.tsx'] as any;
      }
      return [] as any;
    });

    mockFs.statSync.mockImplementation((path: string) => ({
      isDirectory: () => path.includes('src') || path.includes('components'),
      isFile: () => path.includes('.tsx') || path.includes('package.json'),
    }));

    const { result } = renderHook(() => useFileTree('/test'));

    act(() => {
      result.current.loadTree('/test');
    });

    const treeData = result.current.treeData;

    // Should handle nested structure
    expect(treeData.find(item => item.name === 'src')).toBeDefined();
    expect(treeData.find(item => item.name === 'package.json')).toBeDefined();
  });

  it('memoizes loadTree function correctly', () => {
    const { result, rerender } = renderHook(() => useFileTree('/test'));

    const initialLoadTree = result.current.loadTree;

    rerender();

    // Function should be memoized
    expect(result.current.loadTree).toBe(initialLoadTree);
  });

  it('updates tree data when current path changes', () => {
    const { result, rerender } = renderHook((path: string) => useFileTree(path), {
      initialProps: '/test',
    });

    act(() => {
      result.current.loadTree('/test');
    });

    expect(mockFs.readdirSync).toHaveBeenCalledWith('/test');

    // Change path
    rerender('/other');

    act(() => {
      result.current.loadTree('/other');
    });

    expect(mockFs.readdirSync).toHaveBeenCalledWith('/other');
  });

  it('handles files without extensions', () => {
    mockFs.readdirSync.mockReturnValue(['Makefile', 'Dockerfile'] as any);

    mockFs.statSync.mockReturnValue({
      isDirectory: () => false,
      isFile: () => true,
    });

    const { result } = renderHook(() => useFileTree('/test'));

    act(() => {
      result.current.loadTree('/test');
    });

    const treeData = result.current.treeData;

    // Should include files without extensions
    expect(treeData.find(item => item.name === 'Makefile')).toBeDefined();
    expect(treeData.find(item => item.name === 'Dockerfile')).toBeDefined();
  });

  it('returns consistent hook interface', () => {
    const { result } = renderHook(() => useFileTree('/test'));

    // Should return object with expected properties
    expect(result.current).toHaveProperty('treeData');
    expect(result.current).toHaveProperty('loadTree');
    expect(Array.isArray(result.current.treeData)).toBe(true);
    expect(typeof result.current.loadTree).toBe('function');
  });
}); * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFileTree } from './useFileTree.js';

// Mock file system
vi.mock('fs', () => ({
  default: {
    readdirSync: vi.fn(),
    statSync: vi.fn(),
  },
}));

vi.mock('path', () => ({
  default: {
    join: vi.fn((...args) => args.join('/')),
    extname: vi.fn((p) => p.split('.').pop() || ''),
  },
}));

describe('useFileTree', () => {
  const mockFs = vi.mocked(await import('fs')).default;
  const mockPath = vi.mocked(await import('path')).default;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockFs.readdirSync.mockReturnValue([
      'src',
      'package.json',
      'README.md',
      'hidden.txt',
      'node_modules',
    ] as any);

    mockFs.statSync.mockImplementation((path: string) => ({
      isDirectory: () => path.includes('src') || path.includes('node_modules'),
      isFile: () => !path.includes('src') && !path.includes('node_modules'),
    }));

    mockPath.join.mockImplementation((...args) => args.join('/'));
    mockPath.extname.mockImplementation((p) => p.split('.').pop() || '');
  });

  it('initializes with empty tree data', () => {
    const { result } = renderHook(() => useFileTree('/test'));

    expect(result.current.treeData).toEqual([]);
  });

  it('loads file tree data correctly', () => {
    const { result } = renderHook(() => useFileTree('/test'));

    act(() => {
      result.current.loadTree('/test');
    });

    expect(mockFs.readdirSync).toHaveBeenCalledWith('/test');
    expect(result.current.treeData).toBeDefined();
  });

  it('filters out hidden files and directories', () => {
    const { result } = renderHook(() => useFileTree('/test'));

    act(() => {
      result.current.loadTree('/test');
    });

    const treeData = result.current.treeData;

    // Should not include hidden files
    expect(treeData.find(item => item.name === 'hidden.txt')).toBeUndefined();
    expect(treeData.find(item => item.name.startsWith('.'))).toBeUndefined();
  });

  it('filters out node_modules directory', () => {
    const { result } = renderHook(() => useFileTree('/test'));

    act(() => {
      result.current.loadTree('/test');
    });

    const treeData = result.current.treeData;

    // Should not include node_modules
    expect(treeData.find(item => item.name === 'node_modules')).toBeUndefined();
  });

  it('sorts directories before files', () => {
    const { result } = renderHook(() => useFileTree('/test'));

    act(() => {
      result.current.loadTree('/test');
    });

    const treeData = result.current.treeData;

    // Find first file index
    const firstFileIndex = treeData.findIndex(item => item.type === 'file');

    // All directories should come before files
    const directories = treeData.slice(0, firstFileIndex);
    const files = treeData.slice(firstFileIndex);

    expect(directories.every(item => item.type === 'directory')).toBe(true);
    expect(files.every(item => item.type === 'file')).toBe(true);
  });

  it('sorts items alphabetically within types', () => {
    mockFs.readdirSync.mockReturnValue([
      'z-file.ts',
      'a-file.js',
      'm-file.tsx',
      'src',
      'components',
    ] as any);

    mockFs.statSync.mockImplementation((path: string) => ({
      isDirectory: () => path.includes('src') || path.includes('components'),
      isFile: () => !path.includes('src') && !path.includes('components'),
    }));

    const { result } = renderHook(() => useFileTree('/test'));

    act(() => {
      result.current.loadTree('/test');
    });

    const treeData = result.current.treeData;

    // Check directory sorting
    const directories = treeData.filter(item => item.type === 'directory');
    expect(directories[0].name).toBe('components');
    expect(directories[1].name).toBe('src');

    // Check file sorting
    const files = treeData.filter(item => item.type === 'file');
    expect(files[0].name).toBe('a-file.js');
    expect(files[1].name).toBe('m-file.tsx');
    expect(files[2].name).toBe('z-file.ts');
  });

  it('filters file types appropriately', () => {
    mockFs.readdirSync.mockReturnValue([
      'script.py',      // Should be excluded
      'document.pdf',   // Should be excluded
      'image.png',      // Should be excluded
      'code.ts',        // Should be included
      'config.json',    // Should be included
      'readme.md',      // Should be included
    ] as any);

    mockFs.statSync.mockReturnValue({
      isDirectory: () => false,
      isFile: () => true,
    });

    const { result } = renderHook(() => useFileTree('/test'));

    act(() => {
      result.current.loadTree('/test');
    });

    const treeData = result.current.treeData;

    // Should only include relevant file types
    expect(treeData.find(item => item.name === 'script.py')).toBeUndefined();
    expect(treeData.find(item => item.name === 'document.pdf')).toBeUndefined();
    expect(treeData.find(item => item.name === 'image.png')).toBeUndefined();

    expect(treeData.find(item => item.name === 'code.ts')).toBeDefined();
    expect(treeData.find(item => item.name === 'config.json')).toBeDefined();
    expect(treeData.find(item => item.name === 'readme.md')).toBeDefined();
  });

  it('handles file system errors gracefully', () => {
    mockFs.readdirSync.mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const { result } = renderHook(() => useFileTree('/test'));

    act(() => {
      result.current.loadTree('/test');
    });

    // Should handle error without crashing
    expect(result.current.treeData).toEqual([]);
  });

  it('creates correct file paths', () => {
    const { result } = renderHook(() => useFileTree('/test'));

    act(() => {
      result.current.loadTree('/test');
    });

    expect(mockPath.join).toHaveBeenCalled();
    expect(mockFs.readdirSync).toHaveBeenCalledWith('/test');
  });

  it('handles empty directories', () => {
    mockFs.readdirSync.mockReturnValue([] as any);

    const { result } = renderHook(() => useFileTree('/test'));

    act(() => {
      result.current.loadTree('/test');
    });

    expect(result.current.treeData).toEqual([]);
  });

  it('handles nested directory structures', () => {
    mockFs.readdirSync.mockImplementation((path: string) => {
      if (path === '/test') {
        return ['src', 'package.json'] as any;
      }
      if (path === '/test/src') {
        return ['components', 'App.tsx'] as any;
      }
      if (path === '/test/src/components') {
        return ['Button.tsx', 'Input.tsx'] as any;
      }
      return [] as any;
    });

    mockFs.statSync.mockImplementation((path: string) => ({
      isDirectory: () => path.includes('src') || path.includes('components'),
      isFile: () => path.includes('.tsx') || path.includes('package.json'),
    }));

    const { result } = renderHook(() => useFileTree('/test'));

    act(() => {
      result.current.loadTree('/test');
    });

    const treeData = result.current.treeData;

    // Should handle nested structure
    expect(treeData.find(item => item.name === 'src')).toBeDefined();
    expect(treeData.find(item => item.name === 'package.json')).toBeDefined();
  });

  it('memoizes loadTree function correctly', () => {
    const { result, rerender } = renderHook(() => useFileTree('/test'));

    const initialLoadTree = result.current.loadTree;

    rerender();

    // Function should be memoized
    expect(result.current.loadTree).toBe(initialLoadTree);
  });

  it('updates tree data when current path changes', () => {
    const { result, rerender } = renderHook((path: string) => useFileTree(path), {
      initialProps: '/test',
    });

    act(() => {
      result.current.loadTree('/test');
    });

    expect(mockFs.readdirSync).toHaveBeenCalledWith('/test');

    // Change path
    rerender('/other');

    act(() => {
      result.current.loadTree('/other');
    });

    expect(mockFs.readdirSync).toHaveBeenCalledWith('/other');
  });

  it('handles files without extensions', () => {
    mockFs.readdirSync.mockReturnValue(['Makefile', 'Dockerfile'] as any);

    mockFs.statSync.mockReturnValue({
      isDirectory: () => false,
      isFile: () => true,
    });

    const { result } = renderHook(() => useFileTree('/test'));

    act(() => {
      result.current.loadTree('/test');
    });

    const treeData = result.current.treeData;

    // Should include files without extensions
    expect(treeData.find(item => item.name === 'Makefile')).toBeDefined();
    expect(treeData.find(item => item.name === 'Dockerfile')).toBeDefined();
  });

  it('returns consistent hook interface', () => {
    const { result } = renderHook(() => useFileTree('/test'));

    // Should return object with expected properties
    expect(result.current).toHaveProperty('treeData');
    expect(result.current).toHaveProperty('loadTree');
    expect(Array.isArray(result.current.treeData)).toBe(true);
    expect(typeof result.current.loadTree).toBe('function');
  });
});
});
