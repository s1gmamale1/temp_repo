const fs = require('fs');
const path = require('path');
const { getDb, generateId } = require('./database');

const PRESETS_DIR = path.join(__dirname, '..', 'presets');

// Map preset type to directory name
const TYPE_DIRS = {
  pm_mode: 'pm_modes',
  worker_dept: 'departments',
  rnd_division: 'rnd'
};

// Load a single preset from filesystem
function loadPresetFile(type, name) {
  const dir = TYPE_DIRS[type];
  if (!dir) return null;
  const filePath = path.join(PRESETS_DIR, dir, `${name}.md`);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
}

// List all available presets by type (reads directory)
function listPresets(type) {
  const dir = TYPE_DIRS[type];
  if (!dir) return [];
  const dirPath = path.join(PRESETS_DIR, dir);
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const name = f.replace('.md', '');
      const content = fs.readFileSync(path.join(dirPath, f), 'utf8');
      // Extract first line after # as title
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : name;
      // Extract first paragraph as description
      const descMatch = content.match(/^#.+\n\n(.+?)(\n\n|\n#)/s);
      const description = descMatch ? descMatch[1].trim() : '';
      return { name, title, description, type };
    });
}

// List ALL presets grouped by type
function listAllPresets() {
  return {
    pm_modes: listPresets('pm_mode'),
    departments: listPresets('worker_dept'),
    rnd_divisions: listPresets('rnd_division')
  };
}

// Get full preset content
function getPreset(type, name) {
  const content = loadPresetFile(type, name);
  if (!content) return null;
  const titleMatch = content.match(/^#\s+(.+)$/m);
  return {
    name,
    type,
    title: titleMatch ? titleMatch[1] : name,
    content
  };
}

// Extract a specific section from preset content
function extractSection(content, sectionName) {
  const regex = new RegExp(`## ${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`);
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

// Extract task breakdown items from PM mode preset
function extractTaskBreakdown(content) {
  const section = extractSection(content, 'Task Breakdown Template');
  if (!section) return [];
  // Match numbered items like "1. Setup project structure"
  const items = section.match(/^\d+\.\s+(.+)$/gm);
  if (!items) return [];
  return items.map(item => item.replace(/^\d+\.\s+/, '').trim());
}

// Extract model recommendation from preset
function extractModelRecommendation(content) {
  const section = extractSection(content, 'Model Recommendations')
    || extractSection(content, 'AI Model Recommendation')
    || extractSection(content, 'Model');
  return section || null;
}

// Sync filesystem presets to database (for versioning/querying)
function syncPresetsToDb() {
  const db = getDb();
  let synced = 0;

  for (const [type, dir] of Object.entries(TYPE_DIRS)) {
    const presets = listPresets(type);
    for (const preset of presets) {
      const content = loadPresetFile(type, preset.name);
      const existing = db.prepare('SELECT id, content FROM presets WHERE type = ? AND name = ?').get(type, preset.name);

      if (existing) {
        if (existing.content !== content) {
          db.prepare("UPDATE presets SET content = ?, version = version + 1, updated_at = datetime('now') WHERE id = ?")
            .run(content, existing.id);
          synced++;
        }
      } else {
        db.prepare("INSERT INTO presets (id, type, name, content, version, updated_at) VALUES (?, ?, ?, ?, 1, datetime('now'))")
          .run(generateId(), type, preset.name, content);
        synced++;
      }
    }
  }
  return synced;
}

// Validate that a preset name exists for a given type
function validatePreset(type, name) {
  if (!name) return true; // null/undefined is OK (no preset selected)
  const content = loadPresetFile(type, name);
  return content !== null;
}

module.exports = {
  loadPresetFile,
  listPresets,
  listAllPresets,
  getPreset,
  extractSection,
  extractTaskBreakdown,
  extractModelRecommendation,
  syncPresetsToDb,
  validatePreset,
  PRESETS_DIR,
  TYPE_DIRS
};
