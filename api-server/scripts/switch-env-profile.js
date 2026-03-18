#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const PROFILES_DIR = path.join(__dirname, '..', 'env-profiles');
const ENV_FILE = path.join(__dirname, '..', '.env');

const profile = process.argv[2];

if (!profile) {
  console.error('Error: profile name required.');
  listProfiles();
  process.exit(1);
}

const src = path.join(PROFILES_DIR, `${profile}.env`);

if (!fs.existsSync(src)) {
  console.error(`Error: profile "${profile}" not found at ${src}`);
  listProfiles();
  process.exit(1);
}

fs.copyFileSync(src, ENV_FILE);
console.log(`Switched to profile "${profile}" → ${ENV_FILE}`);

function listProfiles() {
  try {
    const files = fs.readdirSync(PROFILES_DIR)
      .filter(f => f.endsWith('.env'))
      .map(f => f.replace('.env', ''));
    console.log('Available profiles:', files.join(', '));
  } catch {
    console.log(`Profiles directory not found: ${PROFILES_DIR}`);
  }
}
