/**
 * Prediction.js – SQLite-backed data layer using sql.js (pure JavaScript)
 *
 * sql.js is a WebAssembly port of SQLite — no native build tools (Visual Studio)
 * required. The database is persisted to disk as plant_disease.db.
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

// ─── Paths ────────────────────────────────────────────────────────────────────
const DB_PATH = path.join(__dirname, '..', 'plant_disease.db');

// ─── Module-level DB reference (initialised synchronously via a trick) ────────
let db = null;

/**
 * Persist the in-memory database to disk.
 * Call after every write operation.
 */
function persist() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

/**
 * Initialise (or load) the SQLite database.
 * Must be called once at startup and awaited before the server listens.
 */
async function initDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log(`SQLite: loaded existing database from ${DB_PATH}`);
  } else {
    db = new SQL.Database();
    console.log(`SQLite: created new database at ${DB_PATH}`);
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS predictions (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      imagePath         TEXT    NOT NULL,
      originalFileName  TEXT    NOT NULL,
      predictedClass    TEXT    NOT NULL,
      plant             TEXT    NOT NULL,
      disease           TEXT    NOT NULL,
      confidence        REAL    NOT NULL,
      topPredictions    TEXT    NOT NULL,
      createdAt         TEXT    NOT NULL
    )
  `);

  persist(); // ensure file exists on first run
}

// ─── Helper: convert a sql.js result row (array of values) to an object ──────
function rowToObj(stmt) {
  const rows = [];
  while (stmt.step()) {
    const cols = stmt.getColumnNames();
    const vals = stmt.get();
    const obj = {};
    cols.forEach((c, i) => { obj[c] = vals[i]; });
    rows.push(obj);
  }
  stmt.free();
  return rows;
}

function deserialize(row) {
  if (!row) return null;
  return {
    ...row,
    topPredictions: JSON.parse(row.topPredictions),
    _id: row.id,   // alias so existing front-end code using _id still works
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

const Prediction = {
  /** Create & persist a new prediction record. Returns the saved object. */
  create(data) {
    const createdAt = new Date().toISOString();
    db.run(
      `INSERT INTO predictions
         (imagePath, originalFileName, predictedClass, plant, disease, confidence, topPredictions, createdAt)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        data.imagePath,
        data.originalFileName,
        data.predictedClass,
        data.plant,
        data.disease,
        data.confidence,
        JSON.stringify(data.topPredictions),
        createdAt,
      ]
    );

    const id = db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0];
    persist();

    const stmt = db.prepare('SELECT * FROM predictions WHERE id = ?');
    stmt.bind([id]);
    const rows = rowToObj(stmt);
    return deserialize(rows[0]);
  },

  /** Find predictions with optional filter + sort. */
  find({ plant, disease, query, sort } = {}) {
    const stmt = db.prepare('SELECT * FROM predictions ORDER BY createdAt DESC');
    let rows = rowToObj(stmt);

    if (plant)   rows = rows.filter(r => r.plant === plant);
    if (disease) rows = rows.filter(r => r.disease === disease);
    if (query) {
      const q = query.toLowerCase();
      rows = rows.filter(r =>
        r.plant.toLowerCase().includes(q) ||
        r.disease.toLowerCase().includes(q) ||
        r.originalFileName.toLowerCase().includes(q)
      );
    }

    if (sort === 'oldest')           rows.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    else if (sort === 'confidence_high') rows.sort((a, b) => b.confidence - a.confidence);
    else if (sort === 'confidence_low')  rows.sort((a, b) => a.confidence - b.confidence);

    return rows.map(deserialize);
  },

  /** Find a single prediction by numeric id. */
  findById(id) {
    const stmt = db.prepare('SELECT * FROM predictions WHERE id = ?');
    stmt.bind([Number(id)]);
    const rows = rowToObj(stmt);
    return deserialize(rows[0] || null);
  },

  /** Delete prediction by id. Returns true if deleted. */
  deleteById(id) {
    db.run('DELETE FROM predictions WHERE id = ?', [Number(id)]);
    persist();
    return true;
  },

  /** Delete all predictions. */
  deleteAll() {
    db.run('DELETE FROM predictions');
    persist();
  },

  /** Count total predictions. */
  count() {
    return db.exec('SELECT COUNT(*) FROM predictions')[0].values[0][0];
  },
};

module.exports = { Prediction, initDb };
