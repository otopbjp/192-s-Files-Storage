const multer = require('multer');

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || '1000', 10) * 1024 * 1024; // En octets

// Utiliser le stockage en mémoire pour traiter les fichiers avant S3
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Ajoutez ici une logique de filtrage plus stricte si nécessaire (par mimetype)
  // Exemple : Autoriser uniquement images et pdf
  // if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
  //   cb(null, true);
  // } else {
  //   cb(new Error('Type de fichier non supporté'), false);
  // }
  cb(null, true); // Accepter tous les fichiers par défaut ici
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: fileFilter,
});

// Middleware pour gérer l'upload
// 'files' est le nom du champ dans le formulaire FormData côté client
const handleUpload = upload.array('files', parseInt(process.env.MAX_FILES_PER_UPLOAD || '20'));

// Middleware pour vérifier la taille totale après Multer
const checkTotalSize = (req, res, next) => {
    if (!req.files || req.files.length === 0) {
        return next(); // Pas de fichiers, pas de vérification nécessaire
    }

    const totalSize = req.files.reduce((sum, file) => sum + file.size, 0);
    const MAX_TOTAL_SIZE = parseInt(process.env.MAX_TOTAL_SIZE_MB || '2000', 10) * 1024 * 1024;

    if (totalSize > MAX_TOTAL_SIZE) {
        // Utiliser une classe d'erreur spécifique pourrait être mieux
        const error = new Error(`La taille totale des fichiers (${(totalSize / 1024 / 1024).toFixed(2)} MB) dépasse la limite autorisée (${process.env.MAX_TOTAL_SIZE_MB} MB).`);
        error.statusCode = 413; // Payload Too Large
        return next(error);
    }
    next();
};


module.exports = { handleUpload, checkTotalSize };