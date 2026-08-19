const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const writer = require('../lib/worldWriter');

// Character emotion images land straight in that character's own folder,
// named after whatever emotion the form said this image is for — same
// naming convention worldLoader already scans for.
const characterUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = writer.characterImageDir(req.params.worldName, req.params.charName);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const emotion = (req.body.emotion || 'neutral').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'neutral';
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      cb(null, `${emotion}${ext}`);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024 }
});

const coverUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = writer.coverImageDest(req.params.worldName);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      cb(null, `cover${ext}`);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024 }
});

router.post('/worlds', (req, res) => {
  try {
    res.json(writer.createWorld(req.body.name, req.body.scenario));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/worlds/:worldName', (req, res) => {
  try {
    res.json(writer.updateWorldMeta(req.params.worldName, req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/worlds/:worldName/cover', coverUpload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  res.json({ ok: true, file: req.file.filename });
});

router.put('/worlds/:worldName/characters/:charName', (req, res) => {
  try {
    res.json(writer.upsertCharacter(req.params.worldName, req.params.charName, req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/worlds/:worldName/characters/:charName', (req, res) => {
  try {
    res.json(writer.deleteCharacter(req.params.worldName, req.params.charName));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/worlds/:worldName/characters/:charName/image', characterUpload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  res.json({ ok: true, file: req.file.filename });
});

router.put('/worlds/:worldName/lore/:index', (req, res) => {
  try {
    const idx = req.params.index === 'new' ? null : Number(req.params.index);
    res.json(writer.upsertLoreEntry(req.params.worldName, idx, req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/worlds/:worldName/lore/:index', (req, res) => {
  try {
    res.json(writer.deleteLoreEntry(req.params.worldName, Number(req.params.index)));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
