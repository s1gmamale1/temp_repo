'use strict';
// Unit tests for orchestration-engine — pure logic only (no DB)
// Run: cross-env NODE_ENV=test node --test src/orchestration-engine.test.js

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// We only import the pure function to avoid DB initialisation in tests.
// Monkey-patch the database module so the require inside orchestration-engine
// does not actually open SQLite.
require('module')._cache;
const Module = require('module');
const origLoad = Module._load.bind(Module);
Module._load = function (request, parent, isMain) {
  if (request === './database' && parent?.filename?.includes('orchestration-engine')) {
    // Return a minimal stub so the module loads without a real DB.
    return { getDb: () => { throw new Error('DB not available in unit tests'); }, generateId: () => 'test-id' };
  }
  if (request === './websocket' && parent?.filename?.includes('orchestration-engine')) {
    return { emitTaskAssigned: () => {} };
  }
  return origLoad(request, parent, isMain);
};

const { inferTaskRole } = require('./orchestration-engine');

describe('inferTaskRole', () => {
  it('returns backend as default for generic text', () => {
    assert.equal(inferTaskRole({ title: 'Do something', description: '' }), 'backend');
  });

  it('detects frontend from title keywords', () => {
    assert.equal(inferTaskRole({ title: 'Build a React component for the form', description: '' }), 'frontend');
  });

  it('detects devops from description keywords', () => {
    const role = inferTaskRole({ title: 'Setup CI', description: 'Configure docker and kubernetes pipeline on AWS' });
    assert.equal(role, 'devops');
  });

  it('detects qa from test keywords', () => {
    const role = inferTaskRole({ title: 'Write e2e tests', description: 'Add regression coverage for the login flow' });
    assert.equal(role, 'qa');
  });

  it('detects database from query keywords', () => {
    const role = inferTaskRole({ title: 'Add migration for new table', description: 'SQL schema change for postgres' });
    assert.equal(role, 'database');
  });

  it('detects security from auth keywords', () => {
    const role = inferTaskRole({ title: 'Implement JWT authentication', description: 'oauth2 endpoint with encryption' });
    assert.equal(role, 'security');
  });

  it('detects mobile from platform keywords', () => {
    const role = inferTaskRole({ title: 'Fix iOS crash on login', description: 'Android flutter build fails' });
    assert.equal(role, 'mobile');
  });

  it('handles null/undefined gracefully', () => {
    assert.doesNotThrow(() => inferTaskRole({}));
    assert.doesNotThrow(() => inferTaskRole({ title: null, description: undefined }));
  });

  it('picks highest-scoring role when multiple match', () => {
    // "react component" hits frontend (2 kw) vs backend (0 kw)
    const role = inferTaskRole({ title: 'Build react component', description: 'UI form layout css' });
    assert.equal(role, 'frontend');
  });
});
