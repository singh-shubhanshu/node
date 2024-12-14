import * as common from '../common/index.mjs';

import assert from 'node:assert';
import path from 'node:path';
import sqlite from 'node:sqlite';
import test from 'node:test';
import fs from 'node:fs';
import childProcess from 'child_process';

// Lib extension binary is named differently on different platforms
function resolveBuiltBinary(binary) {
  const targetFile = fs.readdirSync(path.dirname(process.execPath)).find((file) => file.startsWith(binary));
  return path.join(path.dirname(process.execPath), targetFile);
}

const binary = resolveBuiltBinary('libsqlite_extension');

test('should load extension successfully', () => {
  const db = new sqlite.DatabaseSync(':memory:', {
    allowExtension: true,
  });
  db.loadExtension(binary);
  db.exec('SELECT noop(\'Hello, world!\');');
  const query = db.prepare('SELECT noop(\'Hello, World!\') AS result');
  const { result } = query.get();
  assert.strictEqual(result, 'Hello, World!');
});

test('should not load extension', () => {
  const db = new sqlite.DatabaseSync(':memory:', {
    allowExtension: false,
  });
  assert.throws(() => {
    db.exec('SELECT noop(\'Hello, world!\');');
  }, {
    message: 'no such function: noop',
    code: 'ERR_SQLITE_ERROR',
  });
  assert.throws(() => {
    db.loadExtension(binary);
  }, {
    message: 'extension loading is not allowed',
    code: 'ERR_INVALID_STATE',
  });
  assert.throws(() => {
    const query = db.prepare('SELECT load_extension(?)');
    query.run(binary);
  }, {
    message: 'not authorized',
    code: 'ERR_SQLITE_ERROR',
  });
  assert.throws(() => {
    db.enableLoadExtension();
  }, {
    message: 'The "allow" argument must be a boolean.',
    code: 'ERR_INVALID_ARG_TYPE',
  });

  assert.throws(() => {
    db.enableLoadExtension(true);
  }, {
    message: 'Cannot enable extension loading because it was disabled at database creation.',
  });
});

test('should load extension successfully with enableLoadExtension', () => {
  const db = new sqlite.DatabaseSync(':memory:', {
    allowExtension: true,
  });
  db.loadExtension(binary);
  db.enableLoadExtension(false);
  db.exec('SELECT noop(\'Hello, world!\');');
  const query = db.prepare('SELECT noop(\'Hello, World!\') AS result');
  const { result } = query.get();
  assert.strictEqual(result, 'Hello, World!');
});

test('should not load extension with enableLoadExtension', () => {
  const db = new sqlite.DatabaseSync(':memory:', {
    allowExtension: true,
  });
  db.enableLoadExtension(false);
  assert.throws(() => {
    db.loadExtension(binary);
  }, {
    message: 'extension loading is not allowed',
  });
});

test('should throw error if permission is enabled', async () => {
  const [cmd, opts] = common.escapePOSIXShell`"${process.execPath}" `;
  const code = `const sqlite = require('node:sqlite');
const db = new sqlite.DatabaseSync(':memory:', { allowExtension: true });`;
  return new Promise((resolve) => {
    childProcess.exec(
      `${cmd} --permission -e "${code}"`,
      {
        ...opts,
      },
      common.mustCall((err, _, stderr) => {
        assert.strictEqual(err.code, 1);
        assert.match(stderr, /Error: Cannot load SQLite extensions when the permission model is enabled/);
        assert.match(stderr, /code: 'ERR_LOAD_SQLITE_EXTENSION'/);
        resolve();
      }),
    );
  });
});
