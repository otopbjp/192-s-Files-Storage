const express = require('express');
const router = express.Router();
const { downloadFiles, getTransferInfo } = require('../controllers/downloadController');

// GET /download/:transferId/info - Obtenir les détails SANS télécharger
router.get('/:transferId/info', getTransferInfo);

// GET /download/:transferId - Télécharger le(s) fichier(s)
router.get('/:transferId', downloadFiles);


module.exports = router;