const express = require('express');
const router = express.Router();
const { handleUpload, checkTotalSize } = require('../middleware/uploadHandler');
const { uploadFiles } = require('../controllers/uploadController');

// POST /api/upload
// 1. Multer gère les fichiers (les met en mémoire)
// 2. checkTotalSize vérifie la taille cumulée
// 3. uploadFiles traite la logique métier (upload S3, sauvegarde DB)
router.post('/', handleUpload, checkTotalSize, uploadFiles);

module.exports = router;